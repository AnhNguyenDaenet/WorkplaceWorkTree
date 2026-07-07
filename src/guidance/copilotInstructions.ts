import { CODEMAP_DIR, SERVER_NAME } from '../version.js';

export const BEGIN_MARKER = '<!-- BEGIN workspace-map-mcp -->';
export const END_MARKER = '<!-- END workspace-map-mcp -->';

/** The managed guidance block (FR-010, contracts/map-formats.md). */
export function managedBlock(): string {
  return `${BEGIN_MARKER}
## Workspace maps (generated)

- \`${CODEMAP_DIR}/structure.md\` — full folder/file tree; read this to resolve any relative path instead of listing directories.
- \`${CODEMAP_DIR}/relations.md\` — type→file index, inheritance, imports, calls; read this to jump straight to a type's defining file instead of searching.
- If either file is missing or looks stale (see its generation timestamp), call the \`update_maps\` tool on the \`${SERVER_NAME}\` MCP server.
${END_MARKER}`;
}

export type SectionAction = 'created-file' | 'appended' | 'replaced';

export class DuplicateMarkersError extends Error {
  constructor() {
    super(
      `Multiple "${BEGIN_MARKER}" marker pairs found in the instructions file. ` +
        'Remove the duplicates manually, keeping at most one managed section, then re-run install_guidance.',
    );
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Merge the managed block into existing content (T044):
 * - null content → create file with block
 * - no markers → append block (existing content preserved byte-for-byte)
 * - exactly one marker pair → replace block in place
 * - multiple marker pairs → DuplicateMarkersError, nothing written
 */
export function mergeManagedSection(existing: string | null): {
  content: string;
  action: SectionAction;
} {
  const block = managedBlock();
  if (existing === null) {
    return { content: `${block}\n`, action: 'created-file' };
  }
  const beginCount = countOccurrences(existing, BEGIN_MARKER);
  const endCount = countOccurrences(existing, END_MARKER);
  if (beginCount === 0 && endCount === 0) {
    const separator = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
    return { content: `${existing}${separator}${block}\n`, action: 'appended' };
  }
  if (beginCount === 1 && endCount === 1) {
    const start = existing.indexOf(BEGIN_MARKER);
    const end = existing.indexOf(END_MARKER) + END_MARKER.length;
    if (end - END_MARKER.length < start) throw new DuplicateMarkersError();
    return {
      content: existing.slice(0, start) + block + existing.slice(end),
      action: 'replaced',
    };
  }
  throw new DuplicateMarkersError();
}
