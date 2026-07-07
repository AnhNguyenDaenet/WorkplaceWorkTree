import { afterAll, describe, expect, it } from 'vitest';
import { toolResultReportSchema, updateMapsInputSchema } from '../../src/schemas.js';
import { runUpdateMaps } from '../../src/tools/updateMaps.js';
import { cfg, copyFixture, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('update_maps contract (Tool 3)', () => {
  it('applies force default false', () => {
    expect(updateMapsInputSchema.parse({})).toEqual({ force: false });
  });

  it('rejects unknown properties', () => {
    expect(() => updateMapsInputSchema.parse({ watch: true })).toThrow();
  });

  it('returns a report matching the Tool 3 shape including mode', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    const report = await runUpdateMaps(cfg(dir), false);
    const validated = toolResultReportSchema.parse(report);
    expect(validated.tool).toBe('update_maps');
    expect(['success', 'partial']).toContain(validated.status);
    expect(['incremental', 'full']).toContain(String(validated.counts.mode));
    for (const key of ['added', 'changed', 'removed']) {
      expect(typeof validated.counts[key]).toBe('number');
    }
  });
});
