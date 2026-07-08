import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliUsageError, parseServeArgs } from '../../src/cli/args.js';
import { repoRoot } from '../helpers.js';

/**
 * Contract test (T005): full serve-mode flag table from contracts/cli.md.
 * Error texts for workspace/max-doc-lines are the unchanged v0.1.0 contract
 * (FR-006/FR-008); port/host/version are the feature-002 additions.
 */

function failure(argv: string[]): string {
  try {
    parseServeArgs(argv);
  } catch (err) {
    expect(err).toBeInstanceOf(CliUsageError);
    return (err as Error).message;
  }
  throw new Error(`expected CliUsageError for: ${argv.join(' ')}`);
}

describe('CLI serve-args contract (contracts/cli.md)', () => {
  const missing = path.join(repoRoot, 'no-such-dir-xyz');
  const notADir = path.join(repoRoot, 'package.json');

  it('requires --workspace with the unchanged error text', () => {
    expect(failure([])).toBe('Missing required option --workspace.');
  });

  it('rejects relative workspace paths with the unchanged error text', () => {
    expect(failure(['--workspace', 'relative/dir'])).toBe(
      '--workspace must be an absolute path (got "relative/dir").',
    );
  });

  it('rejects nonexistent workspace with the unchanged error text', () => {
    expect(failure(['--workspace', missing])).toBe(
      `Workspace root not found: "${missing}". Provide an existing, readable directory.`,
    );
  });

  it('rejects a file as workspace with the unchanged error text', () => {
    expect(failure(['--workspace', notADir])).toBe(
      `Workspace root is not a directory: "${notADir}".`,
    );
  });

  it('keeps the unchanged --max-doc-lines validation', () => {
    expect(failure(['--workspace', repoRoot, '--max-doc-lines', '50'])).toBe(
      '--max-doc-lines must be an integer greater than 100 (got "50").',
    );
    const parsed = parseServeArgs(['--workspace', repoRoot, '--max-doc-lines', '500']);
    expect(parsed.kind === 'serve' && parsed.config.maxDocLines).toBe(500);
  });

  it('legacy invocation defaults: stdio transport, maxDocLines 1500, no port', () => {
    const parsed = parseServeArgs(['--workspace', repoRoot]);
    expect(parsed.kind).toBe('serve');
    if (parsed.kind !== 'serve') return;
    expect(parsed.config.transport).toBe('stdio');
    expect(parsed.config.maxDocLines).toBe(1500);
    expect(parsed.config.port).toBeUndefined();
    expect(parsed.config.workspaceRoot).toBe(path.resolve(repoRoot));
  });

  it('requires --port with --http', () => {
    expect(failure(['--workspace', repoRoot, '--http'])).toBe('--port is required with --http.');
  });

  it('validates the port range 1–65535', () => {
    for (const bad of ['0', '65536', 'abc', '3.5']) {
      expect(failure(['--workspace', repoRoot, '--http', '--port', bad])).toBe(
        `--port must be an integer between 1 and 65535 (got "${bad}").`,
      );
    }
    // Negative values are rejected at the parser level (token looks like a flag).
    expect(() => parseServeArgs(['--workspace', repoRoot, '--http', '--port', '-1'])).toThrow(
      CliUsageError,
    );
  });

  it('defaults host to 127.0.0.1; --host is an explicit opt-in (FR-007)', () => {
    const dflt = parseServeArgs(['--workspace', repoRoot, '--http', '--port', '3579']);
    expect(dflt.kind === 'serve' && dflt.config.host).toBe('127.0.0.1');
    const optIn = parseServeArgs(['--workspace', repoRoot, '--http', '--port', '3579', '--host', '0.0.0.0']);
    expect(optIn.kind === 'serve' && optIn.config.host).toBe('0.0.0.0');
  });

  it('parses a full http configuration', () => {
    const parsed = parseServeArgs(['--workspace', repoRoot, '--http', '--port', '3579']);
    expect(parsed.kind).toBe('serve');
    if (parsed.kind !== 'serve') return;
    expect(parsed.config.transport).toBe('http');
    expect(parsed.config.port).toBe(3579);
  });

  it('--version and -v short-circuit before workspace validation (FR-015)', () => {
    expect(parseServeArgs(['--version'])).toEqual({ kind: 'version' });
    expect(parseServeArgs(['-v'])).toEqual({ kind: 'version' });
    // Even with an invalid workspace present, version wins.
    expect(parseServeArgs(['--version', '--workspace', 'relative'])).toEqual({ kind: 'version' });
  });

  it('rejects unknown flags (strict parsing unchanged)', () => {
    expect(() => parseServeArgs(['--workspace', repoRoot, '--bogus'])).toThrow(CliUsageError);
  });
});
