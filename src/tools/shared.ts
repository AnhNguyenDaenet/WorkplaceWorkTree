import { CODEMAP_DIR } from '../version.js';
import { META_FILE } from '../meta/metadata.js';
import type { ToolResultReport } from '../types.js';

export { CODEMAP_DIR };
export const META_FILE_REL = `${CODEMAP_DIR}/${META_FILE}`;

export function nowIso(): string {
  return new Date().toISOString();
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Uniform error report: no files written, actionable message (FR-012, US1-AS4). */
export function reportError(
  tool: string,
  started: number,
  warnings: string[],
  err: unknown,
): ToolResultReport {
  return {
    tool,
    status: 'error',
    filesWritten: [],
    counts: {},
    durationMs: Date.now() - started,
    warnings,
    errors: [errorMessage(err)],
  };
}
