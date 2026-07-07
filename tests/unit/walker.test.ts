import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { walkWorkspace, WalkError } from '../../src/core/walker.js';
import { cfg, fixturePath, mkTmpDir, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('walkWorkspace', () => {
  it('walks the multi-lang fixture honoring default exclusions and .gitignore', async () => {
    const result = await walkWorkspace(cfg(fixturePath('multi-lang')));
    const paths = result.files.map((f) => f.relativePath);

    expect(paths).toContain('src/csharp/OrderService.cs');
    expect(paths).toContain('src/web/app.ts');
    expect(paths).toContain('README.md');
    // Built-in default exclusion (non-overridable).
    expect(paths.some((p) => p.startsWith('node_modules'))).toBe(false);
    // Fixture .gitignore exclusion.
    expect(paths.some((p) => p.startsWith('ignored-folder'))).toBe(false);
    expect(result.fileCount).toBe(paths.length);
    expect(result.exclusions.gitignoreFiles).toBe(1);
    expect(result.exclusions.gitignoreRules).toBe(1);
  });

  it('orders children deterministically: folders before files, case-insensitive alpha', async () => {
    const result = await walkWorkspace(cfg(fixturePath('multi-lang')));
    const rootNames = (result.root.children ?? []).map((c) => `${c.kind}:${c.name}`);
    expect(rootNames).toEqual(['folder:src', 'file:.gitignore', 'file:README.md']);
    const srcEntry = result.root.children!.find((c) => c.name === 'src')!;
    const srcNames = (srcEntry.children ?? []).map((c) => c.name);
    expect(srcNames).toEqual(['csharp', 'go', 'java', 'py', 'rust', 'web']);
  });

  it('terminates on symlink cycles and records the link once', async () => {
    const dir = await mkTmpDir('wmap-symlink-');
    tmpDirs.push(dir);
    await fs.mkdir(path.join(dir, 'a'), { recursive: true });
    await fs.writeFile(path.join(dir, 'a', 'file.txt'), 'hello\n');
    await fs.symlink(dir, path.join(dir, 'a', 'loop'), 'junction');

    const result = await walkWorkspace(cfg(dir));
    const flat: string[] = [];
    const visit = (entry: (typeof result)['root']): void => {
      for (const child of entry.children ?? []) {
        flat.push(`${child.kind}:${child.relativePath}`);
        if (child.kind === 'folder') visit(child);
      }
    };
    visit(result.root);
    expect(flat).toContain('symlink:a/loop');
    expect(flat.filter((f) => f.startsWith('symlink:')).length).toBe(1);
    expect(flat).toContain('file:a/file.txt');
  });

  it('throws an actionable WalkError for a missing root', async () => {
    await expect(walkWorkspace(cfg(path.join(fixturePath('multi-lang'), 'no-such-dir')))).rejects.toThrow(
      WalkError,
    );
  });
});
