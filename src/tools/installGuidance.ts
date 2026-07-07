import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite.js';
import { mergeManagedSection } from '../guidance/copilotInstructions.js';
import { SKILL_REL_PATH, skillMarkdown } from '../guidance/skillTemplate.js';
import { nowIso, reportError } from './shared.js';
import type { ToolResultReport } from '../types.js';

/**
 * install_guidance (T045): write the agent skill (wholesale overwrite) and merge the
 * managed section into copilot-instructions.md, preserving user content (FR-009, FR-010).
 */
export async function runInstallGuidance(
  workspaceRoot: string,
  copilotInstructionsPath: string,
): Promise<ToolResultReport> {
  const started = Date.now();
  const warnings: string[] = [];
  try {
    const instructionsRel = copilotInstructionsPath.replace(/\\/g, '/');
    const instructionsAbs = path.join(workspaceRoot, instructionsRel);

    let existing: string | null = null;
    try {
      existing = await fs.readFile(instructionsAbs, 'utf8');
    } catch {
      existing = null;
    }
    // Merge FIRST: on duplicate markers this throws and nothing is written (US4 guarantee).
    const merged = mergeManagedSection(existing);

    const skillAbs = path.join(workspaceRoot, SKILL_REL_PATH);
    await atomicWriteFile(skillAbs, skillMarkdown());
    await atomicWriteFile(instructionsAbs, merged.content);

    return {
      tool: 'install_guidance',
      status: 'success',
      filesWritten: [SKILL_REL_PATH, instructionsRel],
      counts: { sectionAction: merged.action },
      durationMs: Date.now() - started,
      warnings,
      errors: [],
    };
  } catch (err) {
    return reportError('install_guidance', started, warnings, err);
  }
}

export { nowIso };
