import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runScanStructure } from '../../src/tools/scanStructure.js';
import { cfg, copyFixture, mkTmpDir, readDoc, rmrf, sleep } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('scan_structure integration (US1)', () => {
  it('US1-AS1/AS2: lists every non-excluded file with relative paths; exclusions in header', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    const report = await runScanStructure(cfg(dir));
    expect(report.status).toBe('success');

    const doc = await readDoc(dir, '.codemap/structure.md');
    // Every non-excluded file appears with its relative path comment (FR-001).
    for (const rel of [
      'src/csharp/OrderService.cs',
      'src/csharp/ServiceBase.cs',
      'src/web/app.ts',
      'src/py/zoo.py',
      'src/java/com/example/Main.java',
      'src/go/main.go',
      'src/rust/shapes.rs',
      'README.md',
    ]) {
      expect(doc).toContain(`# ${rel}`);
    }
    // Excluded content absent from the tree (header lists exclusion rule names by design).
    expect(doc).not.toContain('node_modules/');
    expect(doc).not.toContain('fake/index.js');
    expect(doc).not.toContain('ignored-folder/');
    expect(doc).not.toContain('secret.txt');
    // Header metadata (FR-008) + exclusion rules (FR-002).
    expect(doc).toContain('Format version: 1');
    expect(doc).toContain('## Exclusions applied');
    expect(doc).toContain('`.git`');
    expect(doc).toContain('From .gitignore: 1 rule(s) across 1 file(s)');
    // Counts match the report.
    expect(doc).toContain(`| Files | ${report.counts.files} |`);
  });

  it('US1-AS3: re-running regenerates the document with a fresh timestamp', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    await runScanStructure(cfg(dir));
    const first = await readDoc(dir, '.codemap/structure.md');
    await sleep(10);
    await runScanStructure(cfg(dir));
    const second = await readDoc(dir, '.codemap/structure.md');
    const stamp = (doc: string): string => /on (\S+)/.exec(doc)![1];
    expect(stamp(second)).not.toBe(stamp(first));
  });

  it('reflects newly added files on re-scan', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    await runScanStructure(cfg(dir));
    await fs.writeFile(path.join(dir, 'new-file.md'), '# new');
    await runScanStructure(cfg(dir));
    const doc = await readDoc(dir, '.codemap/structure.md');
    expect(doc).toContain('# new-file.md');
  });

  it('empty workspace succeeds with an empty tree (analysis decision A1)', async () => {
    const dir = await mkTmpDir('wmap-empty-');
    tmpDirs.push(dir);
    const report = await runScanStructure(cfg(dir));
    expect(report.status).toBe('success');
    expect(report.counts.files).toBe(0);
  });
});
