#!/usr/bin/env node
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { DEFAULT_MAX_DOC_LINES, SERVER_NAME, VERSION } from './version.js';

function fail(message: string): never {
  console.error(`[${SERVER_NAME}] ${message}`);
  console.error(
    `Usage: ${SERVER_NAME} --workspace <absolute-path> [--max-doc-lines <n>]`,
  );
  process.exit(1);
}

/** CLI entry (T014): validate --workspace, start the stdio MCP server. */
async function main(): Promise<void> {
  let values: { workspace?: string; 'max-doc-lines'?: string };
  try {
    ({ values } = parseArgs({
      options: {
        workspace: { type: 'string' },
        'max-doc-lines': { type: 'string' },
      },
      strict: true,
    }));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const workspace = values.workspace;
  if (!workspace) {
    fail('Missing required option --workspace.');
  }
  if (!path.isAbsolute(workspace)) {
    fail(`--workspace must be an absolute path (got "${workspace}").`);
  }
  let stat;
  try {
    stat = statSync(workspace);
  } catch {
    fail(`Workspace root not found: "${workspace}". Provide an existing, readable directory.`);
  }
  if (!stat.isDirectory()) {
    fail(`Workspace root is not a directory: "${workspace}".`);
  }
  try {
    accessSync(workspace, constants.R_OK);
  } catch {
    fail(`Workspace root is not readable: "${workspace}". Check permissions.`);
  }

  let maxDocLines = DEFAULT_MAX_DOC_LINES;
  if (values['max-doc-lines'] !== undefined) {
    maxDocLines = Number(values['max-doc-lines']);
    if (!Number.isInteger(maxDocLines) || maxDocLines <= 100) {
      fail(`--max-doc-lines must be an integer greater than 100 (got "${values['max-doc-lines']}").`);
    }
  }

  const server = createServer({ workspaceRoot: path.resolve(workspace), maxDocLines });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${VERSION} ready — workspace: ${workspace}`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
