import { describe, expect, it } from 'vitest';
import { BUILT_IN_EXCLUDES, IgnoreEngine } from '../../src/core/ignoreRules.js';
import { cfg, fixturePath } from '../helpers.js';

describe('IgnoreEngine', () => {
  it('excludes built-in defaults at any depth', () => {
    const engine = new IgnoreEngine(cfg('/x'));
    expect(engine.isExcluded('node_modules', true)).toBe(true);
    expect(engine.isExcluded('a/b/node_modules/pkg/index.js', false)).toBe(true);
    expect(engine.isExcluded('.git', true)).toBe(true);
    expect(engine.isExcluded('.codemap', true)).toBe(true);
    expect(engine.isExcluded('src/app.ts', false)).toBe(false);
  });

  it('built-ins are NOT overridable by include patterns', () => {
    const engine = new IgnoreEngine(cfg('/x', { includePatterns: ['node_modules/**'] }));
    expect(engine.isExcluded('node_modules/pkg/index.js', false)).toBe(true);
  });

  it('applies user exclude patterns with include-pattern re-inclusion', () => {
    const engine = new IgnoreEngine(
      cfg('/x', { excludePatterns: ['secret/**'], includePatterns: ['secret/keep.txt'] }),
    );
    expect(engine.isExcluded('secret/a.txt', false)).toBe(true);
    expect(engine.isExcluded('secret/keep.txt', false)).toBe(false);
    expect(engine.isExcluded('open/a.txt', false)).toBe(false);
  });

  it('honors .gitignore rules loaded from a directory', async () => {
    const engine = new IgnoreEngine(cfg(fixturePath('multi-lang')));
    await engine.loadGitignore('', fixturePath('multi-lang'));
    expect(engine.isExcluded('ignored-folder', true)).toBe(true);
    expect(engine.isExcluded('ignored-folder/secret.txt', false)).toBe(true);
    expect(engine.isExcluded('src', true)).toBe(false);
  });

  it('reports an applied-rules summary for document headers', async () => {
    const engine = new IgnoreEngine(cfg(fixturePath('multi-lang'), { excludePatterns: ['*.tmp'] }));
    await engine.loadGitignore('', fixturePath('multi-lang'));
    const summary = engine.summary();
    expect(summary.builtIn).toEqual([...BUILT_IN_EXCLUDES]);
    expect(summary.gitignoreFiles).toBe(1);
    expect(summary.gitignoreRules).toBe(1);
    expect(summary.userExclude).toEqual(['*.tmp']);
  });
});
