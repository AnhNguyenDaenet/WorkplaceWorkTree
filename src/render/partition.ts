import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite.js';
import { CODEMAP_DIR } from '../version.js';

export interface RenderedDocs {
  /** workspace-relative doc path -> content */
  docs: Map<string, string>;
  partitions: number;
}

export function needsPartition(doc: string, maxDocLines: number): boolean {
  return doc.split('\n').length > maxDocLines;
}

export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : '_root';
}

export function partitionDocRelPath(kind: 'structure' | 'relations', folderName: string): string {
  return `${CODEMAP_DIR}/${kind}/${sanitizeFolderName(folderName)}.md`;
}

/**
 * Atomically write all docs, then remove stale partition files from previous runs.
 * Write-first ordering keeps documents valid even if interrupted mid-cleanup (FR-014).
 */
export async function writeDocsAndCleanup(
  workspaceRoot: string,
  docs: Map<string, string>,
  kind: 'structure' | 'relations',
): Promise<string[]> {
  const written: string[] = [];
  for (const [rel, content] of docs) {
    await atomicWriteFile(path.join(workspaceRoot, rel), content);
    written.push(rel);
  }
  const partitionDirRel = `${CODEMAP_DIR}/${kind}`;
  const dirAbs = path.join(workspaceRoot, partitionDirRel);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dirAbs);
  } catch {
    return written;
  }
  for (const entry of entries) {
    const rel = `${partitionDirRel}/${entry}`;
    if (entry.endsWith('.md') && !docs.has(rel)) {
      await fs.rm(path.join(dirAbs, entry), { force: true });
    }
  }
  return written;
}
