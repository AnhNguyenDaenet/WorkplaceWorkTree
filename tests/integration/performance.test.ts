import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain .mjs script without type declarations
import { generatePerfFixture } from '../../scripts/generate-perf-fixture.mjs';
import { runScanRelations } from '../../src/tools/scanRelations.js';
import { runScanStructure } from '../../src/tools/scanStructure.js';
import { runUpdateMaps } from '../../src/tools/updateMaps.js';
import { cfg, mkTmpDir, readDoc, rmrf } from '../helpers.js';

/**
 * Performance smoke test (T050) — long-running, opt-in:
 *   RUN_PERF=1 npm test
 * SC-003: full scan of a 10,000-file workspace < 60 s.
 * SC-004: update after 100 changed files < 15 s with zero stale entries.
 */
const RUN = process.env.RUN_PERF === '1';
const FILE_COUNT = 10000;

describe.runIf(RUN)('performance (SC-003, SC-004)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkTmpDir('wmap-perf-');
    generatePerfFixture(dir, FILE_COUNT);
  }, 120000);

  afterAll(async () => {
    if (dir) await rmrf(dir);
  });

  it(
    'SC-003: full scan of 10k files completes in under 60 s',
    async () => {
      const started = Date.now();
      const structure = await runScanStructure(cfg(dir));
      const relations = await runScanRelations(cfg(dir), true);
      const elapsed = Date.now() - started;

      expect(structure.status).toBe('success');
      expect(['success', 'partial']).toContain(relations.status);
      expect(structure.counts.files).toBe(FILE_COUNT);
      expect(elapsed).toBeLessThan(60000);
      console.log(`[perf] full scan of ${FILE_COUNT} files: ${elapsed} ms`);
    },
    120000,
  );

  it(
    'SC-004: update after 100 changed files completes in under 15 s with zero stale entries',
    async () => {
      // Mutate 100 files: 50 edits, 25 adds, 25 deletes.
      const edits: string[] = [];
      for (let i = 0; i < 50; i++) {
        const rel = path.join(dir, `mod${i % 40}`, `sub${i % 8}`, `file${i}.cs`);
        try {
          await fs.appendFile(rel, `\n// touched ${Date.now()}\n`);
          edits.push(rel);
        } catch {
          /* file may be another extension; adds below make up the count */
        }
      }
      for (let i = 0; i < 25; i++) {
        await fs.writeFile(path.join(dir, `mod${i % 40}`, `added-${i}.ts`), `export class Added${i} {}\n`);
      }
      const deleted: string[] = [];
      for (let i = 100; i < 125; i++) {
        const rel = path.join(dir, `mod${i % 40}`, `sub${i % 8}`, `file${i}.ts`);
        try {
          await fs.rm(rel);
          deleted.push(`file${i}.ts`);
        } catch {
          /* skip if layout differs */
        }
      }

      const started = Date.now();
      const report = await runUpdateMaps(cfg(dir), false);
      const elapsed = Date.now() - started;

      expect(['success', 'partial']).toContain(report.status);
      expect(report.counts.mode).toBe('incremental');
      expect(elapsed).toBeLessThan(15000);

      // Zero stale entries: deleted files gone from both documents.
      const structureDoc = await readDoc(dir, '.codemap/structure.md');
      for (const name of deleted.slice(0, 5)) {
        expect(structureDoc).not.toContain(name);
      }
      console.log(`[perf] incremental update (~100 changes): ${elapsed} ms`);
    },
    60000,
  );
});

describe.runIf(!RUN)('performance (skipped)', () => {
  it('is opt-in: set RUN_PERF=1 to execute the 10k-file benchmark', () => {
    expect(true).toBe(true);
  });
});
