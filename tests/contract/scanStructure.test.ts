import { afterAll, describe, expect, it } from 'vitest';
import { scanStructureInputSchema, toolResultReportSchema } from '../../src/schemas.js';
import { runScanStructure } from '../../src/tools/scanStructure.js';
import { cfg, copyFixture, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('scan_structure contract (Tool 1)', () => {
  it('accepts valid input and applies defaults', () => {
    const parsed = scanStructureInputSchema.parse({});
    expect(parsed).toEqual({ includePatterns: [], excludePatterns: [] });
  });

  it('rejects unknown properties (additionalProperties false)', () => {
    expect(() => scanStructureInputSchema.parse({ nope: true })).toThrow();
  });

  it('rejects wrong types', () => {
    expect(() => scanStructureInputSchema.parse({ includePatterns: 'not-an-array' })).toThrow();
  });

  it('returns a report matching the Tool 1 shape with deterministic ordering', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    const report = await runScanStructure(cfg(dir));
    const validated = toolResultReportSchema.parse(report);
    expect(validated.tool).toBe('scan_structure');
    expect(validated.status).toBe('success');
    expect(validated.filesWritten).toContain('.codemap/structure.md');
    expect(typeof validated.counts.folders).toBe('number');
    expect(typeof validated.counts.files).toBe('number');
    expect(typeof validated.counts.partitions).toBe('number');
    expect(validated.durationMs).toBeGreaterThanOrEqual(0);

    // Deterministic: same workspace twice -> same filesWritten ordering.
    const second = await runScanStructure(cfg(dir));
    expect(second.filesWritten).toEqual(report.filesWritten);
  });
});
