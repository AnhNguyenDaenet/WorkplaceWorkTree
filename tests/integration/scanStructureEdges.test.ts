import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { runScanStructure } from '../../src/tools/scanStructure.js';
import { cfg, exists, fixturePath, mkTmpDir, readDoc, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

/** A workspace big enough that its structure doc exceeds a 101-line threshold. */
async function makeWideWorkspace(): Promise<string> {
  const dir = await mkTmpDir('wmap-wide-');
  tmpDirs.push(dir);
  for (const folder of ['alpha', 'beta', 'gamma']) {
    await fs.mkdir(path.join(dir, folder), { recursive: true });
    for (let i = 0; i < 45; i++) {
      await fs.writeFile(path.join(dir, folder, `file${String(i).padStart(2, '0')}.md`), `# ${i}\n`);
    }
  }
  return dir;
}

describe('scan_structure edge cases (US1-AS4, FR-015)', () => {
  it('nonexistent root → error report, no files written, no partial .codemap output', async () => {
    const missing = path.join(fixturePath('multi-lang'), 'definitely-not-here');
    const report = await runScanStructure(cfg(missing));
    expect(report.status).toBe('error');
    expect(report.filesWritten).toEqual([]);
    expect(report.errors[0]).toMatch(/not found|unreadable/i);
    expect(await exists(path.join(missing, '.codemap'))).toBe(false);
  });

  it('file passed as root → actionable error', async () => {
    const filePath = path.join(fixturePath('multi-lang'), 'README.md');
    const report = await runScanStructure(cfg(filePath));
    expect(report.status).toBe('error');
    expect(report.errors[0]).toMatch(/not a directory/i);
  });

  it('partitions per top-level folder when exceeding maxDocLines (FR-015)', async () => {
    const dir = await makeWideWorkspace();
    const report = await runScanStructure(cfg(dir, { maxDocLines: 101 }));
    expect(report.status).toBe('success');
    expect(Number(report.counts.partitions)).toBe(3);

    const index = await readDoc(dir, '.codemap/structure.md');
    expect(index).toContain('## Partitions');
    expect(index).toContain('| Folder | Document | Files |');
    expect(index).toContain('.codemap/structure/alpha.md');
    // Partition doc exists and contains the folder subtree with full relative paths.
    const partition = await readDoc(dir, '.codemap/structure/alpha.md');
    expect(partition).toContain('# alpha/file00.md');
    expect(partition).toContain('Format version: 1');
  });

  it('cleans up stale partition files when a re-scan no longer needs them', async () => {
    const dir = await makeWideWorkspace();
    await runScanStructure(cfg(dir, { maxDocLines: 101 })); // partitioned
    expect(await exists(path.join(dir, '.codemap/structure/alpha.md'))).toBe(true);
    await runScanStructure(cfg(dir)); // default threshold: single doc again
    expect(await exists(path.join(dir, '.codemap/structure/alpha.md'))).toBe(false);
  });
});
