import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BEGIN_MARKER,
  END_MARKER,
} from '../../src/guidance/copilotInstructions.js';
import { runInstallGuidance } from '../../src/tools/installGuidance.js';
import { copyFixture, mkTmpDir, readDoc, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

const INSTRUCTIONS_REL = '.github/copilot-instructions.md';

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('install_guidance integration (US4)', () => {
  it('US4-AS1: appends the managed block, preserving existing content byte-for-byte', async () => {
    const dir = await mkTmpDir('wmap-guid-');
    tmpDirs.push(dir);
    const userContent = '# My project rules\n\n- Always use tabs. \t\n- Weird spacing preserved.  \n';
    await fs.mkdir(path.join(dir, '.github'), { recursive: true });
    await fs.writeFile(path.join(dir, INSTRUCTIONS_REL), userContent);

    const report = await runInstallGuidance(dir, INSTRUCTIONS_REL);
    expect(report.status).toBe('success');
    expect(report.counts.sectionAction).toBe('appended');

    const merged = await readDoc(dir, INSTRUCTIONS_REL);
    expect(merged.startsWith(userContent)).toBe(true); // untouched prefix
    expect(merged).toContain(BEGIN_MARKER);
    expect(merged).toContain(END_MARKER);
    expect(merged).toContain('.codemap/structure.md');
    expect(merged).toContain('.codemap/relations.md');
    expect(merged).toContain('update_maps');
  });

  it('US4-AS2: creates the file when absent', async () => {
    const dir = await mkTmpDir('wmap-guid-');
    tmpDirs.push(dir);
    const report = await runInstallGuidance(dir, INSTRUCTIONS_REL);
    expect(report.status).toBe('success');
    expect(report.counts.sectionAction).toBe('created-file');
    const content = await readDoc(dir, INSTRUCTIONS_REL);
    expect(content).toContain(BEGIN_MARKER);
  });

  it('US4-AS4: re-running replaces the managed block in place — exactly one block', async () => {
    const dir = await mkTmpDir('wmap-guid-');
    tmpDirs.push(dir);
    await fs.mkdir(path.join(dir, '.github'), { recursive: true });
    await fs.writeFile(path.join(dir, INSTRUCTIONS_REL), '# Rules\n\ncontent above\n');
    await runInstallGuidance(dir, INSTRUCTIONS_REL);

    const afterFirst = await readDoc(dir, INSTRUCTIONS_REL);
    const withSuffix = `${afterFirst}\n## User section added later\n`;
    await fs.writeFile(path.join(dir, INSTRUCTIONS_REL), withSuffix);

    const report = await runInstallGuidance(dir, INSTRUCTIONS_REL);
    expect(report.counts.sectionAction).toBe('replaced');
    const final = await readDoc(dir, INSTRUCTIONS_REL);
    expect(countOccurrences(final, BEGIN_MARKER)).toBe(1);
    expect(countOccurrences(final, END_MARKER)).toBe(1);
    expect(final).toContain('content above');
    expect(final).toContain('## User section added later');
  });

  it('duplicate marker pairs → error, file untouched', async () => {
    const dir = await mkTmpDir('wmap-guid-');
    tmpDirs.push(dir);
    const broken = `${BEGIN_MARKER}\nA\n${END_MARKER}\n${BEGIN_MARKER}\nB\n${END_MARKER}\n`;
    await fs.mkdir(path.join(dir, '.github'), { recursive: true });
    await fs.writeFile(path.join(dir, INSTRUCTIONS_REL), broken);

    const report = await runInstallGuidance(dir, INSTRUCTIONS_REL);
    expect(report.status).toBe('error');
    expect(report.errors[0]).toMatch(/marker pairs/i);
    expect(report.filesWritten).toEqual([]);
    expect(await readDoc(dir, INSTRUCTIONS_REL)).toBe(broken); // untouched
  });

  it('US4-AS3: installed SKILL.md teaches map consumption and staleness refresh', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    await runInstallGuidance(dir, INSTRUCTIONS_REL);
    const skill = await readDoc(dir, '.github/skills/workspace-map/SKILL.md');
    expect(skill).toContain('.codemap/structure.md');
    expect(skill).toContain('.codemap/relations.md');
    expect(skill).toContain('update_maps');
    expect(skill).toContain('workspace-map-mcp');
    expect(skill).toMatch(/^---\nname: workspace-map/m);
  });
});
