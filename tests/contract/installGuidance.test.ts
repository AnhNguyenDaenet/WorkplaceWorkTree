import { afterAll, describe, expect, it } from 'vitest';
import { installGuidanceInputSchema, toolResultReportSchema } from '../../src/schemas.js';
import { runInstallGuidance } from '../../src/tools/installGuidance.js';
import { copyFixture, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('install_guidance contract (Tool 4)', () => {
  it('applies the default copilotInstructionsPath', () => {
    expect(installGuidanceInputSchema.parse({})).toEqual({
      copilotInstructionsPath: '.github/copilot-instructions.md',
    });
  });

  it('rejects unknown properties', () => {
    expect(() => installGuidanceInputSchema.parse({ path: 'x' })).toThrow();
  });

  it('returns a report matching the Tool 4 shape with a sectionAction count', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    const report = await runInstallGuidance(dir, '.github/copilot-instructions.md');
    const validated = toolResultReportSchema.parse(report);
    expect(validated.tool).toBe('install_guidance');
    expect(validated.status).toBe('success');
    expect(['created-file', 'appended', 'replaced']).toContain(String(validated.counts.sectionAction));
    expect(validated.filesWritten).toContain('.github/skills/workspace-map/SKILL.md');
    expect(validated.filesWritten).toContain('.github/copilot-instructions.md');
  });
});
