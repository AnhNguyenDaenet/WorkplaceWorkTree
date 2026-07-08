import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServerEntry, mergeMcpJson, InitError } from '../../src/cli/init.js';
import { exists, mkTmpDir, readDoc, repoRoot, rmrf } from '../helpers.js';

/**
 * init command integration (T025, US4-AS1/AS2/AS3, SC-005): fresh project,
 * sibling preservation, idempotent re-run, corrupt-JSON abort, guidance opt-in,
 * http entry variant.
 */

function runInit(args: string[], targetDir: string): { status: number; stdout: string; stderr: string } {
  // Spawn from repoRoot so `--import tsx` resolves; the target project is passed explicitly.
  const withTarget = args.includes('--target') ? args : ['--target', targetDir, ...args];
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(repoRoot, 'src', 'index.ts'), 'init', ...withTarget],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

async function readConfig(dir: string): Promise<Record<string, any>> {
  return JSON.parse(await readDoc(dir, '.vscode/mcp.json'));
}

describe('init command (US4)', () => {
  const dirs: string[] = [];

  async function tempProject(): Promise<string> {
    const dir = await mkTmpDir('wmap-init-');
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (dirs.length) await rmrf(dirs.pop()!);
  });

  it('creates .vscode/mcp.json with a working npx entry in a fresh project (US4-AS1)', async () => {
    const dir = await tempProject();
    const result = runInit(['--yes'], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('fileAction:         created');
    expect(result.stdout).toContain('entryAction:        added');

    const config = await readConfig(dir);
    expect(config.servers['workspace-map']).toEqual({
      command: 'npx',
      args: ['@anhndh1997/workspace-map-mcp', '--workspace', '${workspaceFolder}'],
    });
  });

  it('preserves sibling servers and top-level keys on merge (US4-AS2)', async () => {
    const dir = await tempProject();
    const existing = {
      inputs: [{ id: 'token', type: 'promptString' }],
      servers: {
        'other-a': { command: 'other-a-cmd', args: ['--flag'] },
        'other-b': { url: 'http://localhost:9999/mcp' },
      },
    };
    await fs.mkdir(path.join(dir, '.vscode'), { recursive: true });
    await fs.writeFile(path.join(dir, '.vscode', 'mcp.json'), JSON.stringify(existing, null, 2));

    const result = runInit(['--yes', '--channel', 'global'], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('entryAction:        added');

    const config = await readConfig(dir);
    expect(config.inputs).toEqual(existing.inputs);
    expect(config.servers['other-a']).toEqual(existing.servers['other-a']);
    expect(config.servers['other-b']).toEqual(existing.servers['other-b']);
    expect(config.servers['workspace-map']).toEqual({
      command: 'workspace-map-mcp',
      args: ['--workspace', '${workspaceFolder}'],
    });
  });

  it('re-run updates in place — exactly one entry, never duplicated (US4-AS2 edge)', async () => {
    const dir = await tempProject();
    expect(runInit(['--yes'], dir).status).toBe(0);
    const second = runInit(['--yes', '--transport', 'http', '--port', '4000'], dir);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('entryAction:        updated');

    const raw = await readDoc(dir, '.vscode/mcp.json');
    expect(raw.split('"workspace-map"').length - 1).toBe(1);
    const config = await readConfig(dir);
    expect(config.servers['workspace-map']).toEqual({ url: 'http://127.0.0.1:4000/mcp' });
  });

  it('aborts untouched on corrupt/JSONC config with exit 1 (edge case)', async () => {
    const dir = await tempProject();
    const jsonc = '{\n  // my servers\n  "servers": {}\n}\n';
    await fs.mkdir(path.join(dir, '.vscode'), { recursive: true });
    await fs.writeFile(path.join(dir, '.vscode', 'mcp.json'), jsonc);

    const result = runInit(['--yes'], dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JSONC');
    expect(await readDoc(dir, '.vscode/mcp.json')).toBe(jsonc); // byte-untouched
  });

  it('--guidance --yes installs skill + managed section in the target (US4-AS3, FR-013)', async () => {
    const dir = await tempProject();
    const result = runInit(['--guidance', '--yes'], dir);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('guidanceInstalled:  true');
    expect(await exists(path.join(dir, '.github/skills/workspace-map/SKILL.md'))).toBe(true);
    const instructions = await readDoc(dir, '.github/copilot-instructions.md');
    expect(instructions).toContain('<!-- BEGIN workspace-map-mcp -->');
  });

  it('validates flags with actionable errors', async () => {
    const dir = await tempProject();
    const badTransport = runInit(['--yes', '--transport', 'carrier-pigeon'], dir);
    expect(badTransport.status).toBe(1);
    expect(badTransport.stderr).toContain('--transport must be "stdio" or "http"');

    const badTarget = runInit(['--yes', '--target', path.join(dir, 'nope')], dir);
    expect(badTarget.status).toBe(1);
    expect(badTarget.stderr).toContain('Target directory not found');
  });

  it('generated config is always valid JSON parseable by MCP clients (SC-005)', async () => {
    const dir = await tempProject();
    for (const args of [
      ['--yes'],
      ['--yes', '--channel', 'docker'],
      ['--yes', '--transport', 'http'],
    ]) {
      expect(runInit(args, dir).status).toBe(0);
      const config = await readConfig(dir); // throws on invalid JSON
      expect(Object.keys(config.servers)).toContain('workspace-map');
    }
    // Last write wins: default http port entry variant.
    const config = await readConfig(dir);
    expect(config.servers['workspace-map']).toEqual({ url: 'http://127.0.0.1:3579/mcp' });
  });
});

describe('mergeMcpJson state machine (data-model §4)', () => {
  const entry = buildServerEntry('stdio', 'npx', 3579);

  it('no file → created/added', () => {
    const result = mergeMcpJson(null, entry);
    expect(result.fileAction).toBe('created');
    expect(result.entryAction).toBe('added');
    expect(JSON.parse(result.content).servers['workspace-map']).toEqual(entry);
  });

  it('valid json without entry → updated/added, siblings kept', () => {
    const result = mergeMcpJson('{"servers":{"x":{"command":"x"}},"other":1}', entry);
    expect(result.fileAction).toBe('updated');
    expect(result.entryAction).toBe('added');
    const doc = JSON.parse(result.content);
    expect(doc.other).toBe(1);
    expect(doc.servers.x).toEqual({ command: 'x' });
  });

  it('valid json with entry → replaced in place', () => {
    const existing = JSON.stringify({ servers: { 'workspace-map': { command: 'old' } } });
    const result = mergeMcpJson(existing, entry);
    expect(result.entryAction).toBe('updated');
    expect(JSON.parse(result.content).servers['workspace-map']).toEqual(entry);
  });

  it('invalid json / JSONC → InitError, nothing produced', () => {
    expect(() => mergeMcpJson('{ // comment\n}', entry)).toThrow(InitError);
    expect(() => mergeMcpJson('[]', entry)).toThrow(InitError);
  });

  it('docker stdio variant matches data-model §4', () => {
    expect(buildServerEntry('stdio', 'docker', 3579)).toEqual({
      command: 'docker',
      args: [
        'run', '-i', '--rm',
        '-v', '${workspaceFolder}:/workspace',
        'ghcr.io/anhnguyendaenet/workspace-map-mcp',
        '--workspace', '/workspace',
      ],
    });
  });
});
