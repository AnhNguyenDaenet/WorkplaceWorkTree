import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { atomicWriteFile } from '../core/atomicWrite.js';
import { runInstallGuidance } from '../tools/installGuidance.js';
import { PACKAGE_NAME, SERVER_NAME } from '../version.js';

/**
 * `init` subcommand (T022/T023, FR-012/FR-013, research R5): create or update the
 * target project's .vscode/mcp.json with a `servers["workspace-map"]` entry —
 * strict-JSON merge, sibling-preserving, idempotent, atomic — and optionally run
 * the feature-001 guidance installer.
 */

export type InitTransport = 'stdio' | 'http';
export type InitChannel = 'npx' | 'global' | 'docker';

export const SERVER_ENTRY_KEY = 'workspace-map';
export const DEFAULT_HTTP_PORT = 3579;
const DOCKER_IMAGE = 'ghcr.io/anhnguyendaenet/workspace-map-mcp';

export class InitError extends Error {}

export type McpServerEntry =
  | { command: string; args: string[] }
  | { url: string };

/** Entry variants exactly per data-model.md §4. */
export function buildServerEntry(
  transport: InitTransport,
  channel: InitChannel,
  port: number,
): McpServerEntry {
  if (transport === 'http') {
    return { url: `http://127.0.0.1:${port}/mcp` };
  }
  switch (channel) {
    case 'npx':
      return { command: 'npx', args: [PACKAGE_NAME, '--workspace', '${workspaceFolder}'] };
    case 'global':
      return { command: SERVER_NAME, args: ['--workspace', '${workspaceFolder}'] };
    case 'docker':
      return {
        command: 'docker',
        args: [
          'run', '-i', '--rm',
          '-v', '${workspaceFolder}:/workspace',
          DOCKER_IMAGE,
          '--workspace', '/workspace',
        ],
      };
  }
}

export interface MergeResult {
  content: string;
  fileAction: 'created' | 'updated';
  entryAction: 'added' | 'updated';
}

/**
 * Strict-JSON merge state machine (data-model.md §4): owns exactly
 * `servers["workspace-map"]`; every sibling key/server is preserved; parse
 * failure aborts before any write.
 */
export function mergeMcpJson(existingText: string | null, entry: McpServerEntry): MergeResult {
  let doc: Record<string, unknown> = {};
  let fileAction: MergeResult['fileAction'] = 'created';

  if (existingText !== null) {
    fileAction = 'updated';
    let parsed: unknown;
    try {
      parsed = JSON.parse(existingText);
    } catch (err) {
      throw new InitError(
        '.vscode/mcp.json is not strictly valid JSON ' +
          `(${err instanceof Error ? err.message : String(err)}). ` +
          'JSONC (comments/trailing commas) is not supported by init — ' +
          'fix or remove the offending syntax, or add the entry manually. File left untouched.',
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new InitError(
        '.vscode/mcp.json must contain a JSON object at the top level. File left untouched.',
      );
    }
    doc = parsed as Record<string, unknown>;
  }

  const servers =
    typeof doc.servers === 'object' && doc.servers !== null && !Array.isArray(doc.servers)
      ? (doc.servers as Record<string, unknown>)
      : {};
  const entryAction: MergeResult['entryAction'] =
    SERVER_ENTRY_KEY in servers ? 'updated' : 'added';

  const nextDoc = { ...doc, servers: { ...servers, [SERVER_ENTRY_KEY]: entry } };
  return { content: `${JSON.stringify(nextDoc, null, 2)}\n`, fileAction, entryAction };
}

interface InitOptions {
  targetDir: string;
  transport: InitTransport;
  channel: InitChannel;
  port: number;
  guidance: boolean | 'prompt';
}

async function parseInitArgs(argv: string[]): Promise<InitOptions> {
  let values: {
    target?: string;
    transport?: string;
    channel?: string;
    port?: string;
    guidance?: boolean;
    yes?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        target: { type: 'string' },
        transport: { type: 'string' },
        channel: { type: 'string' },
        port: { type: 'string' },
        guidance: { type: 'boolean' },
        yes: { type: 'boolean' },
      },
      strict: true,
    }));
  } catch (err) {
    throw new InitError(err instanceof Error ? err.message : String(err));
  }

  const targetDir = path.resolve(values.target ?? process.cwd());
  let stat;
  try {
    stat = await fs.stat(targetDir);
  } catch {
    throw new InitError(`Target directory not found: "${targetDir}".`);
  }
  if (!stat.isDirectory()) {
    throw new InitError(`Target is not a directory: "${targetDir}".`);
  }

  const transport = values.transport ?? 'stdio';
  if (transport !== 'stdio' && transport !== 'http') {
    throw new InitError(`--transport must be "stdio" or "http" (got "${transport}").`);
  }
  const channel = values.channel ?? 'npx';
  if (channel !== 'npx' && channel !== 'global' && channel !== 'docker') {
    throw new InitError(`--channel must be "npx", "global", or "docker" (got "${channel}").`);
  }
  let port = DEFAULT_HTTP_PORT;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new InitError(`--port must be an integer between 1 and 65535 (got "${values.port}").`);
    }
  }

  const guidance: InitOptions['guidance'] = values.guidance ? true : values.yes ? false : 'prompt';
  return { targetDir, transport, channel, port, guidance };
}

async function confirmGuidance(): Promise<boolean> {
  if (!process.stdin.isTTY) return false; // non-interactive: never hang, assume no
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      'Install agent guidance (skill + managed copilot-instructions section)? [y/N] ',
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** Entry point for `workspace-map-mcp init`. Exits the process (0 success / 1 failure). */
export async function runInit(argv: string[]): Promise<never> {
  try {
    const options = await parseInitArgs(argv);
    const configFile = path.join(options.targetDir, '.vscode', 'mcp.json');

    let existingText: string | null = null;
    try {
      existingText = await fs.readFile(configFile, 'utf8');
    } catch {
      existingText = null;
    }

    const entry = buildServerEntry(options.transport, options.channel, options.port);
    const merged = mergeMcpJson(existingText, entry);
    await atomicWriteFile(configFile, merged.content);

    let guidanceInstalled = false;
    const wantGuidance = options.guidance === 'prompt' ? await confirmGuidance() : options.guidance;
    if (wantGuidance) {
      const report = await runInstallGuidance(options.targetDir, '.github/copilot-instructions.md');
      if (report.status !== 'success') {
        console.error(`[${SERVER_NAME}] guidance install failed: ${report.errors.join('; ')}`);
        process.exit(1);
      }
      guidanceInstalled = true;
    }

    const nextSteps = [
      `Reload your MCP client (VS Code: run "MCP: List Servers" → start "${SERVER_ENTRY_KEY}").`,
      options.transport === 'http'
        ? `Start the server first: ${SERVER_NAME} --workspace ${options.targetDir} --http --port ${options.port}`
        : 'The client launches the server on demand — no manual start needed.',
      'Ask your agent to run scan_structure to generate the first maps.',
    ];

    // InitResult (data-model.md §5) — structured, human-readable.
    console.log(`[${SERVER_NAME}] init complete`);
    console.log(`  targetDir:          ${options.targetDir}`);
    console.log(`  configFile:         ${configFile}`);
    console.log(`  fileAction:         ${merged.fileAction}`);
    console.log(`  entryAction:        ${merged.entryAction}`);
    console.log(`  transport:          ${options.transport}`);
    console.log(`  channel:            ${options.transport === 'http' ? 'http-url' : options.channel}`);
    console.log(`  guidanceInstalled:  ${guidanceInstalled}`);
    console.log('  next steps:');
    for (const step of nextSteps) console.log(`    - ${step}`);
    process.exit(0);
  } catch (err) {
    if (err instanceof InitError) {
      console.error(`[${SERVER_NAME}] init: ${err.message}`);
      console.error(
        `Usage: ${SERVER_NAME} init [--target <dir>] [--transport stdio|http] ` +
          '[--channel npx|global|docker] [--port <n>] [--guidance] [--yes]',
      );
    } else {
      console.error(
        `[${SERVER_NAME}] init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    process.exit(1);
  }
}
