import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_MAX_DOC_LINES } from '../version.js';

/**
 * Shared CLI argument parsing/validation (T002, contracts/cli.md).
 * Workspace and max-doc-lines validation moved verbatim from v0.1.0 src/index.ts —
 * error texts are a stable contract (FR-006/FR-008).
 */

/** Launch-time transport settings (data-model.md §1). */
export interface TransportConfiguration {
  /** Resolved absolute workspace root handed to createServer. */
  workspaceRoot: string;
  /** The --workspace value exactly as typed (logs print this — byte-identical to v0.1.0). */
  workspaceInput: string;
  transport: 'stdio' | 'http';
  /** Set only when transport === 'http' (stdio ignores port/host entirely). */
  port?: number;
  host: string;
  maxDocLines: number;
}

export type ParsedCli = { kind: 'version' } | { kind: 'serve'; config: TransportConfiguration };

/** Validation failure carrying the exact user-facing message (router prints it via fail()). */
export class CliUsageError extends Error {}

function usageFail(message: string): never {
  throw new CliUsageError(message);
}

/** Parse + validate serve-mode argv (everything after the bin name, no subcommand). */
export function parseServeArgs(argv: string[]): ParsedCli {
  let values: {
    workspace?: string;
    'max-doc-lines'?: string;
    http?: boolean;
    port?: string;
    host?: string;
    version?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        workspace: { type: 'string' },
        'max-doc-lines': { type: 'string' },
        http: { type: 'boolean' },
        port: { type: 'string' },
        host: { type: 'string' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
    }));
  } catch (err) {
    usageFail(err instanceof Error ? err.message : String(err));
  }

  // FR-015: --version short-circuits before any workspace validation.
  if (values.version) return { kind: 'version' };

  const workspace = values.workspace;
  if (!workspace) {
    usageFail('Missing required option --workspace.');
  }
  if (!path.isAbsolute(workspace)) {
    usageFail(`--workspace must be an absolute path (got "${workspace}").`);
  }
  let stat;
  try {
    stat = statSync(workspace);
  } catch {
    usageFail(`Workspace root not found: "${workspace}". Provide an existing, readable directory.`);
  }
  if (!stat.isDirectory()) {
    usageFail(`Workspace root is not a directory: "${workspace}".`);
  }
  try {
    accessSync(workspace, constants.R_OK);
  } catch {
    usageFail(`Workspace root is not readable: "${workspace}". Check permissions.`);
  }

  let maxDocLines = DEFAULT_MAX_DOC_LINES;
  if (values['max-doc-lines'] !== undefined) {
    maxDocLines = Number(values['max-doc-lines']);
    if (!Number.isInteger(maxDocLines) || maxDocLines <= 100) {
      usageFail(`--max-doc-lines must be an integer greater than 100 (got "${values['max-doc-lines']}").`);
    }
  }

  let port: number | undefined;
  if (values.http) {
    if (values.port === undefined) {
      usageFail('--port is required with --http.');
    }
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      usageFail(`--port must be an integer between 1 and 65535 (got "${values.port}").`);
    }
  }

  return {
    kind: 'serve',
    config: {
      workspaceRoot: path.resolve(workspace),
      workspaceInput: workspace,
      transport: values.http ? 'http' : 'stdio',
      port,
      host: values.host ?? '127.0.0.1',
      maxDocLines,
    },
  };
}
