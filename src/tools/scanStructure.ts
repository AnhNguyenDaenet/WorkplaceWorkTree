import path from 'node:path';
import { walkWorkspace } from '../core/walker.js';
import {
  buildMetadata,
  hashFile,
  readMetadataRaw,
  writeMetadata,
} from '../meta/metadata.js';
import { renderStructure } from '../render/structureMarkdown.js';
import { writeDocsAndCleanup } from '../render/partition.js';
import { CODEMAP_DIR, META_FILE_REL, nowIso, reportError } from './shared.js';
import type { FileRecord, ScanConfiguration, ToolResultReport } from '../types.js';

/**
 * scan_structure (T019): walk → render → partition → atomic write into .codemap/,
 * merge FileRecords into meta.json. Unreadable root → error report, no partial output (US1-AS4).
 */
export async function runScanStructure(config: ScanConfiguration): Promise<ToolResultReport> {
  const started = Date.now();
  const warnings: string[] = [];
  try {
    const walk = await walkWorkspace(config);
    const generatedAt = nowIso();
    const workspaceName = path.basename(config.workspaceRoot) || config.workspaceRoot;

    const rendered = renderStructure({
      walk,
      workspaceName,
      generatedAt,
      maxDocLines: config.maxDocLines,
    });
    const written = await writeDocsAndCleanup(config.workspaceRoot, rendered.docs, 'structure');

    // Merge file records, preserving relation data for files whose content is unchanged.
    const prior = await readMetadataRaw(config.workspaceRoot);
    const priorByPath = new Map((prior?.files ?? []).map((f) => [f.relativePath, f]));
    const files: FileRecord[] = [];
    for (const file of walk.files) {
      const contentHash = await hashFile(file.absolutePath);
      const old = priorByPath.get(file.relativePath);
      const unchanged = old?.contentHash === contentHash;
      files.push({
        relativePath: file.relativePath,
        size: file.size,
        mtimeMs: file.mtimeMs,
        contentHash,
        language: unchanged ? (old?.language ?? null) : null,
        typeIds: unchanged ? (old?.typeIds ?? []) : [],
      });
    }
    const meta = buildMetadata(config, generatedAt, files, {
      types: prior?.types ?? [],
      dependencies: prior?.dependencies ?? [],
      reduced: prior?.reduced ?? [],
    });
    await writeMetadata(config.workspaceRoot, meta);
    written.push(META_FILE_REL);

    return {
      tool: 'scan_structure',
      status: 'success',
      filesWritten: written,
      counts: {
        folders: walk.folderCount,
        files: walk.fileCount,
        partitions: rendered.partitions,
      },
      durationMs: Date.now() - started,
      warnings,
      errors: [],
    };
  } catch (err) {
    return reportError('scan_structure', started, warnings, err);
  }
}

export { CODEMAP_DIR };
