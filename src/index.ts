#!/usr/bin/env node
import { CliUsageError, parseServeArgs } from './cli/args.js';
import { createServer } from './server.js';
import { startStdio } from './transport/stdio.js';
import { SERVER_NAME, VERSION } from './version.js';

/**
 * Thin CLI router (T004, research R4): default → serve (stdio unless --http),
 * `init` → project setup subcommand, `--version`/`-v` → print version (FR-015).
 * Legacy invocation `--workspace <p> [--max-doc-lines n]` behaves byte-identically
 * to v0.1.0 (contracts/cli.md backward-compatibility guarantee, FR-006).
 */

function fail(message: string): never {
  console.error(`[${SERVER_NAME}] ${message}`);
  console.error(
    `Usage: ${SERVER_NAME} --workspace <absolute-path> [--max-doc-lines <n>]`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === 'init') {
    const { runInit } = await import('./cli/init.js');
    await runInit(argv.slice(1));
    return;
  }

  let parsed;
  try {
    parsed = parseServeArgs(argv);
  } catch (err) {
    if (err instanceof CliUsageError) fail(err.message);
    throw err;
  }

  if (parsed.kind === 'version') {
    console.log(VERSION);
    process.exit(0);
  }

  const { config } = parsed;

  if (config.transport === 'http') {
    const { startHttp } = await import('./transport/http.js');
    await startHttp(config);
    return;
  }

  const server = createServer({ workspaceRoot: config.workspaceRoot, maxDocLines: config.maxDocLines });
  await startStdio(server, config);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
