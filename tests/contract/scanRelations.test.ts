import { afterAll, describe, expect, it } from 'vitest';
import { scanRelationsInputSchema, toolResultReportSchema } from '../../src/schemas.js';
import { runScanRelations } from '../../src/tools/scanRelations.js';
import { cfg, copyFixture, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('scan_relations contract (Tool 2)', () => {
  it('applies includeCalls default true', () => {
    const parsed = scanRelationsInputSchema.parse({});
    expect(parsed.includeCalls).toBe(true);
    expect(parsed.includePatterns).toEqual([]);
  });

  it('rejects unknown properties', () => {
    expect(() => scanRelationsInputSchema.parse({ callGraph: true })).toThrow();
  });

  it('returns a report matching the Tool 2 shape', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    const report = await runScanRelations(cfg(dir), true);
    const validated = toolResultReportSchema.parse(report);
    expect(validated.tool).toBe('scan_relations');
    expect(validated.status).toBe('success'); // docs-only: nothing reduced
    expect(validated.filesWritten).toContain('.codemap/relations.md');
    for (const key of ['types', 'relations', 'fileDependencies', 'reducedAnalysisFiles', 'partitions']) {
      expect(typeof validated.counts[key]).toBe('number');
    }
  });

  it('reports partial status when files receive reduced analysis', async () => {
    const dir = await copyFixture('unparseable');
    tmpDirs.push(dir);
    const report = await runScanRelations(cfg(dir), true);
    expect(report.status).toBe('partial');
    expect(Number(report.counts.reducedAnalysisFiles)).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.includes('reduced analysis'))).toBe(true);
  });
});
