import { promises as fs } from 'node:fs';
import path from 'node:path';
import { walkWorkspace } from '../core/walker.js';
import {
  buildMetadata,
  diffFiles,
  hashFile,
  readMetadata,
  writeMetadata,
} from '../meta/metadata.js';
import { renderStructure } from '../render/structureMarkdown.js';
import { writeDocsAndCleanup } from '../render/partition.js';
import { runScanStructure } from './scanStructure.js';
import {
  analyzeAll,
  resolveModel,
  runScanRelations,
  writeRelationsOutputs,
  type FileAnalysis,
} from './scanRelations.js';
import { CODEMAP_DIR, META_FILE_REL, nowIso, reportError } from './shared.js';
import type { FileRecord, ScanConfiguration, ToolResultReport, TypeEntry } from '../types.js';

async function mapsExist(workspaceRoot: string): Promise<boolean> {
  const structure = path.join(workspaceRoot, CODEMAP_DIR, 'structure.md');
  const relations = path.join(workspaceRoot, CODEMAP_DIR, 'relations.md');
  try {
    await fs.access(structure);
    await fs.access(relations);
    return true;
  } catch {
    return false;
  }
}

function mergeReports(
  started: number,
  warnings: string[],
  structure: ToolResultReport,
  relations: ToolResultReport,
  counts: Record<string, number | string>,
): ToolResultReport {
  const errors = [...structure.errors, ...relations.errors];
  const status =
    errors.length > 0 ? 'error' : relations.status === 'partial' ? 'partial' : 'success';
  return {
    tool: 'update_maps',
    status,
    filesWritten: [...new Set([...structure.filesWritten, ...relations.filesWritten])],
    counts,
    durationMs: Date.now() - started,
    warnings: [...warnings, ...structure.warnings, ...relations.warnings],
    errors,
  };
}

/**
 * update_maps (T039): incremental refresh from meta.json diffing; full generation
 * when maps/metadata are missing, corrupt, drifted, or `force` is set (FR-005).
 */
export async function runUpdateMaps(
  config: ScanConfiguration,
  force: boolean,
): Promise<ToolResultReport> {
  const started = Date.now();
  const warnings: string[] = [];
  try {
    const metaResult = await readMetadata(config.workspaceRoot, config);
    const haveMaps = await mapsExist(config.workspaceRoot);

    if (force || metaResult.fullGenerationRequired || !haveMaps) {
      if (!force) {
        warnings.push(
          `full generation: ${metaResult.reason ?? (haveMaps ? 'unknown' : 'map documents missing')}`,
        );
      }
      const structureReport = await runScanStructure(config);
      if (structureReport.status === 'error') {
        return {
          ...structureReport,
          tool: 'update_maps',
          warnings: [...warnings, ...structureReport.warnings],
        };
      }
      const relationsReport = await runScanRelations(config, true);
      return mergeReports(started, warnings, structureReport, relationsReport, {
        added: Number(structureReport.counts.files ?? 0),
        changed: 0,
        removed: 0,
        mode: 'full',
      });
    }

    // Incremental path (research R8): re-walk, diff, re-parse only added/changed files.
    const meta = metaResult.metadata!;
    const walk = await walkWorkspace(config);
    const diff = await diffFiles(meta.files, walk.files);
    const generatedAt = nowIso();
    const workspaceName = path.basename(config.workspaceRoot) || config.workspaceRoot;

    // Evict stale entries: everything defined in removed/changed files (US3-AS2).
    const dirtyPaths = new Set<string>([
      ...diff.removed.map((r) => r.relativePath),
      ...diff.changed.map((c) => c.relativePath),
    ]);
    const keptTypes: TypeEntry[] = meta.types.filter((t) => !dirtyPaths.has(t.definingFile));
    const keptDeps = meta.dependencies.filter((d) => !dirtyPaths.has(d.fromFile));
    const keptReduced = meta.reduced.filter((r) => !dirtyPaths.has(r.relativePath));

    // Re-analyze added + changed files only.
    const freshAnalyses = await analyzeAll([...diff.added, ...diff.changed], true);

    // Rebuild the model: synthesize analyses for kept files so resolution sees everything.
    const keptByFile = new Map<string, FileAnalysis>();
    for (const t of keptTypes) {
      const entry = keptByFile.get(t.definingFile) ?? {
        relativePath: t.definingFile,
        language: t.language,
        tier: 'deep' as const,
        types: [],
        rawDependencies: [],
        reducedReason: null,
      };
      // Reset prior resolution so targets re-resolve against the merged model.
      entry.types.push({
        ...t,
        relations: t.relations.map((r) => ({ ...r, targetId: null })),
      });
      keptByFile.set(t.definingFile, entry);
    }
    for (const r of keptReduced) {
      const entry = keptByFile.get(r.relativePath) ?? {
        relativePath: r.relativePath,
        language: null,
        tier: 'fallback' as const,
        types: [],
        rawDependencies: [],
        reducedReason: r.reason,
      };
      entry.reducedReason = r.reason;
      keptByFile.set(r.relativePath, entry);
    }
    for (const d of keptDeps) {
      const entry = keptByFile.get(d.fromFile) ?? {
        relativePath: d.fromFile,
        language: null,
        tier: 'none' as const,
        types: [],
        rawDependencies: [],
        reducedReason: null,
      };
      entry.rawDependencies.push({
        fromFile: d.fromFile,
        rawSpecifier: d.rawSpecifier,
        specKind: d.toFile ? 'module-path' : 'external',
        spec: d.toFile ?? d.rawSpecifier,
      });
      keptByFile.set(d.fromFile, entry);
    }
    // Preserve language labels for unchanged files (coverage table fidelity).
    const langByFile = new Map(meta.files.map((f) => [f.relativePath, f.language]));
    for (const [file, entry] of keptByFile) {
      if (entry.language === null) entry.language = langByFile.get(file) ?? null;
    }

    const allAnalyses = [...keptByFile.values(), ...freshAnalyses];
    const model = resolveModel(allAnalyses, new Set(walk.files.map((f) => f.relativePath)));

    // Structure map: always re-rendered from the fresh walk (cheap).
    const structureDocs = renderStructure({
      walk,
      workspaceName,
      generatedAt,
      maxDocLines: config.maxDocLines,
    });
    const structureWritten = await writeDocsAndCleanup(
      config.workspaceRoot,
      structureDocs.docs,
      'structure',
    );
    const relationsWritten = await writeRelationsOutputs(config, walk, model, generatedAt);

    // Refresh file records (stat-refreshed unchanged + rehashed fresh files).
    const unchangedByPath = new Map(diff.unchanged.map((u) => [u.relativePath, u]));
    const files: FileRecord[] = [];
    for (const file of walk.files) {
      const unchanged = unchangedByPath.get(file.relativePath);
      if (unchanged) {
        files.push({
          ...unchanged,
          language: model.fileLanguage.get(file.relativePath) ?? unchanged.language,
          typeIds: model.fileTypeIds.get(file.relativePath) ?? unchanged.typeIds,
        });
      } else {
        files.push({
          relativePath: file.relativePath,
          size: file.size,
          mtimeMs: file.mtimeMs,
          contentHash: await hashFile(file.absolutePath),
          language: model.fileLanguage.get(file.relativePath) ?? null,
          typeIds: model.fileTypeIds.get(file.relativePath) ?? [],
        });
      }
    }
    await writeMetadata(
      config.workspaceRoot,
      buildMetadata(config, generatedAt, files, {
        types: model.types,
        dependencies: model.dependencies,
        reduced: model.reduced,
      }),
    );

    if (model.reduced.length > 0) {
      warnings.push(`${model.reduced.length} file(s) received reduced analysis`);
    }
    return {
      tool: 'update_maps',
      status: model.reduced.length > 0 ? 'partial' : 'success',
      filesWritten: [...new Set([...structureWritten, ...relationsWritten, META_FILE_REL])],
      counts: {
        added: diff.added.length,
        changed: diff.changed.length,
        removed: diff.removed.length,
        mode: 'incremental',
      },
      durationMs: Date.now() - started,
      warnings,
      errors: [],
    };
  } catch (err) {
    return reportError('update_maps', started, warnings, err);
  }
}
