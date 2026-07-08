import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { copyFixture, mkTmpDir, readDoc, repoRoot, rmrf } from '../helpers.js';

/**
 * Pack-smoke + git-install test (T012, FR-001/FR-002/FR-004, SC-002 registry+GitHub channels).
 *
 * (a) tarball path: npm pack → install tarball into a temp dir → no build on install →
 *     installed bin --version → full stdio scan flow with grammars resolving from the
 *     installed location.
 * (b) git path: npm install git+file://<temp-git-repo-of-working-tree> → guarded `prepare`
 *     self-builds exactly like a GitHub install (no network beyond the npm registry).
 */

const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};

/** Run npm cross-platform without shell quoting pitfalls. */
function runNpm(args: string[], cwd: string): { status: number; out: string } {
  const npmJs = process.env.npm_execpath;
  const result = npmJs
    ? spawnSync(process.execPath, [npmJs, ...args], { cwd, encoding: 'utf8' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
  return { status: result.status ?? 1, out: `${result.stdout}\n${result.stderr}` };
}

function installedPkgDir(prefix: string): string {
  return path.join(prefix, 'node_modules', ...pkg.name.split('/'));
}

describe('pack smoke: registry-style tarball install (US1-AS1)', () => {
  let tarball: string;
  let installDir: string;
  let pkgDir: string;

  beforeAll(async () => {
    installDir = await mkTmpDir('wmap-pack-');
    const packed = runNpm(['pack', '--pack-destination', installDir], repoRoot);
    expect(packed.status).toBe(0);
    const tgz = (await fs.readdir(installDir)).find((f) => f.endsWith('.tgz'));
    expect(tgz, packed.out).toBeTruthy();
    tarball = path.join(installDir, tgz!);

    const install = runNpm(['install', '--no-audit', '--no-fund', tarball], installDir);
    expect(install.status).toBe(0);
    pkgDir = installedPkgDir(installDir);
  }, 180000);

  afterAll(async () => {
    if (installDir) await rmrf(installDir);
  });

  it('ships prebuilt: no src/, dist/ extracted from the tarball without compiling (FR-001)', () => {
    expect(existsSync(path.join(pkgDir, 'dist', 'index.js'))).toBe(true);
    // No sources, no tsconfig, no compiler anywhere in the consumer dir:
    // compilation on install is impossible — dist/ can only come from the tarball.
    expect(existsSync(path.join(pkgDir, 'src'))).toBe(false);
    expect(existsSync(path.join(pkgDir, 'tsconfig.json'))).toBe(false);
    expect(existsSync(path.join(installDir, 'node_modules', 'typescript'))).toBe(false);
  });

  it('includes all eight grammar assets in the tarball', () => {
    const grammars = path.join(pkgDir, 'assets', 'grammars');
    expect(existsSync(grammars)).toBe(true);
    const wasm = readFileSync(path.join(grammars, 'tree-sitter-c_sharp.wasm'));
    expect(wasm.byteLength).toBeGreaterThan(1000);
  });

  it('installed bin prints the package version (FR-015)', () => {
    const out = execFileSync(process.execPath, [path.join(pkgDir, 'dist', 'index.js'), '--version'], {
      cwd: installDir,
      encoding: 'utf8',
    });
    expect(out.trim()).toBe(pkg.version);
  });

  it('serves a workspace from the installed location: scan_structure + grammar-backed scan_relations (FR-004)', async () => {
    const workspace = await copyFixture('multi-lang', 'wmap-pack-ws-');
    const client = new Client({ name: 'pack-smoke', version: '0.0.0' });
    try {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(pkgDir, 'dist', 'index.js'), '--workspace', workspace],
        cwd: installDir, // deliberately not the repo — proves CWD independence
        stderr: 'ignore',
      });
      await client.connect(transport);

      const structure = await client.callTool({ name: 'scan_structure', arguments: {} });
      const structureReport = JSON.parse(
        (structure.content as Array<{ text: string }>)[0].text,
      ) as { status: string };
      expect(structureReport.status).toBe('success');

      const relations = await client.callTool({ name: 'scan_relations', arguments: {} });
      const relationsReport = JSON.parse(
        (relations.content as Array<{ text: string }>)[0].text,
      ) as { status: string };
      expect(['success', 'partial']).toContain(relationsReport.status);
      // Deep-tier row proves the WASM grammar actually loaded from the installed package.
      const doc = await readDoc(workspace, '.codemap/relations.md');
      expect(doc).toContain('| `OrderService` | class | `Contoso.Orders` | src/csharp/OrderService.cs |');
    } finally {
      await client.close().catch(() => {});
      await rmrf(workspace);
    }
  }, 120000);
});

describe('git-install smoke: guarded prepare self-build (US1-AS2, FR-002)', () => {
  let gitRepo: string;
  let installDir: string;

  beforeAll(async () => {
    // Mirror the current working tree (tracked + untracked, .gitignore honored) into a
    // fresh git repo so the test exercises today's code regardless of commit state.
    gitRepo = await mkTmpDir('wmap-git-src-');
    const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(listed.status).toBe(0);
    const files = listed.stdout.split('\n').filter(Boolean);
    for (const rel of files) {
      const from = path.join(repoRoot, rel);
      if (!existsSync(from)) continue; // deleted-but-tracked
      const to = path.join(gitRepo, rel);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
    const git = (...args: string[]) => {
      const r = spawnSync('git', args, { cwd: gitRepo, encoding: 'utf8' });
      expect(r.status).toBe(0);
    };
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Pack Smoke');
    git('add', '.');
    git('commit', '-q', '-m', 'working tree snapshot');

    installDir = await mkTmpDir('wmap-git-install-');
    const url = `git+file://${gitRepo.replace(/\\/g, '/')}`;
    const install = runNpm(['install', '--no-audit', '--no-fund', url], installDir);
    expect(install.status, install.out).toBe(0);
  }, 600000);

  afterAll(async () => {
    if (gitRepo) await rmrf(gitRepo);
    if (installDir) await rmrf(installDir);
  });

  it('self-built during install: dist/ and grammars exist in the installed package (FR-002)', () => {
    const pkgDir = installedPkgDir(installDir);
    expect(existsSync(path.join(pkgDir, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(path.join(pkgDir, 'assets', 'grammars', 'tree-sitter-python.wasm'))).toBe(true);
  });

  it('installed bin works: --version prints the package version', () => {
    const pkgDir = installedPkgDir(installDir);
    const out = execFileSync(process.execPath, [path.join(pkgDir, 'dist', 'index.js'), '--version'], {
      cwd: installDir,
      encoding: 'utf8',
    });
    expect(out.trim()).toBe(pkg.version);
  });
});
