import { promises as fs } from 'node:fs';
import path from 'node:path';
import posixPath from 'node:path/posix';
import { walkWorkspace, type WalkedFile, type WalkResult } from '../core/walker.js';
import { detectFile, type AnalysisTier } from '../relations/detect.js';
import { extractFallbackImports } from '../relations/fallbackImports.js';
import {
  getParser,
  treeHasError,
  type ExtractorOutput,
  type RawDependency,
} from '../relations/parserRegistry.js';
import { extractCSharp } from '../relations/extractors/csharp.js';
import { extractGo } from '../relations/extractors/go.js';
import { extractJava } from '../relations/extractors/java.js';
import { extractPython } from '../relations/extractors/python.js';
import { extractRust } from '../relations/extractors/rust.js';
import { extractTypeScript } from '../relations/extractors/typescript.js';
import {
  buildMetadata,
  hashFile,
  readMetadataRaw,
  writeMetadata,
} from '../meta/metadata.js';
import { renderRelations, type LanguageCoverageRow } from '../render/relationsMarkdown.js';
import { writeDocsAndCleanup } from '../render/partition.js';
import { META_FILE_REL, nowIso, reportError } from './shared.js';
import type {
  FileDependency,
  FileRecord,
  ReducedAnalysisFile,
  ScanConfiguration,
  ToolResultReport,
  TypeEntry,
} from '../types.js';

const MAX_PARSE_BYTES = 2_000_000;

export interface FileAnalysis {
  relativePath: string;
  language: string | null;
  tier: AnalysisTier;
  types: TypeEntry[];
  rawDependencies: RawDependency[];
  reducedReason: string | null;
}

/** Parse + extract a single file (shared by scan_relations and incremental update_maps). */
export async function analyzeFile(
  file: WalkedFile,
  includeCalls: boolean,
): Promise<FileAnalysis> {
  const relPath = file.relativePath;
  const base: FileAnalysis = {
    relativePath: relPath,
    language: null,
    tier: 'none',
    types: [],
    rawDependencies: [],
    reducedReason: null,
  };

  let firstLine: string | undefined;
  if (!path.extname(relPath)) {
    try {
      const fh = await fs.open(file.absolutePath, 'r');
      const buf = Buffer.alloc(160);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      await fh.close();
      firstLine = buf.subarray(0, bytesRead).toString('utf8').split(/\r?\n/, 1)[0];
    } catch {
      /* undetectable — stays tier none */
    }
  }

  const detection = detectFile(relPath, firstLine);
  base.language = detection.language;
  base.tier = detection.tier;
  if (detection.tier === 'none') return base;

  if (file.size > MAX_PARSE_BYTES) {
    base.reducedReason = 'file too large for analysis';
    return base;
  }

  let content: string;
  try {
    content = await fs.readFile(file.absolutePath, 'utf8');
  } catch {
    base.reducedReason = 'unreadable file';
    return base;
  }

  if (detection.tier === 'fallback') {
    base.rawDependencies = extractFallbackImports(content, relPath);
    base.reducedReason = 'fallback tier (imports only)';
    return base;
  }

  // Deep tier
  try {
    const parser = await getParser(detection.language!);
    if (!parser) {
      base.rawDependencies = extractFallbackImports(content, relPath);
      base.reducedReason = 'no grammar available (imports only)';
      base.tier = 'fallback';
      return base;
    }
    const tree = parser.parse(content);
    const root = tree.rootNode;
    let output: ExtractorOutput;
    switch (detection.language) {
      case 'csharp':
        output = extractCSharp(root, relPath, includeCalls);
        break;
      case 'typescript':
      case 'tsx':
      case 'javascript':
        output = extractTypeScript(root, relPath, includeCalls, detection.language);
        break;
      case 'python':
        output = extractPython(root, relPath, includeCalls);
        break;
      case 'java':
        output = extractJava(root, relPath, includeCalls);
        break;
      case 'go':
        output = extractGo(root, relPath, includeCalls);
        break;
      case 'rust':
        output = extractRust(root, relPath, includeCalls);
        break;
      default:
        output = { types: [], dependencies: [] };
    }
    base.types = output.types;
    base.rawDependencies = output.dependencies;
    if (treeHasError(root)) {
      base.reducedReason = 'syntax errors (partial analysis)';
    }
    return base;
  } catch (err) {
    base.reducedReason = `parse failure (${err instanceof Error ? err.message : 'unknown'})`;
    return base;
  }
}

export interface RelationModel {
  types: TypeEntry[];
  dependencies: FileDependency[];
  reduced: ReducedAnalysisFile[];
  languageCoverage: LanguageCoverageRow[];
  fileLanguage: Map<string, string | null>;
  fileTypeIds: Map<string, string[]>;
}

/** Resolve raw dependencies + relation targets across the whole model (T034). */
export function resolveModel(analyses: FileAnalysis[], allFiles: Set<string>): RelationModel {
  const types = analyses.flatMap((a) => a.types);
  const nameIndex = new Map<string, TypeEntry[]>();
  const qualifierToFile = new Map<string, string>();
  for (const t of types) {
    const list = nameIndex.get(t.name) ?? [];
    list.push(t);
    nameIndex.set(t.name, list);
    if (t.qualifier && !qualifierToFile.has(t.qualifier)) {
      qualifierToFile.set(t.qualifier, t.definingFile);
    }
  }

  // Resolve inheritance/implements targets (FR-013-aware: unique match or same-language unique match).
  for (const t of types) {
    for (const rel of t.relations) {
      const candidates = nameIndex.get(rel.targetName) ?? [];
      const eligible = candidates.filter((c) => c.id !== t.id);
      if (eligible.length === 1) {
        rel.targetId = eligible[0].id;
      } else if (eligible.length > 1) {
        const sameLang = eligible.filter((c) => c.language === t.language);
        rel.targetId = sameLang.length === 1 ? sameLang[0].id : null;
      }
    }
  }

  const dependencies: FileDependency[] = [];
  for (const analysis of analyses) {
    for (const raw of analysis.rawDependencies) {
      dependencies.push({
        fromFile: raw.fromFile,
        toFile: resolveDependency(raw, qualifierToFile, allFiles),
        rawSpecifier: raw.rawSpecifier,
      });
    }
  }

  const reduced: ReducedAnalysisFile[] = analyses
    .filter((a) => a.reducedReason !== null)
    .map((a) => ({ relativePath: a.relativePath, reason: a.reducedReason! }));

  const coverage = new Map<string, LanguageCoverageRow>();
  for (const a of analyses) {
    const label = a.language ?? 'other';
    const row = coverage.get(label) ?? { language: label, files: 0, tier: a.tier };
    row.files++;
    if (row.tier === 'none' && a.tier !== 'none') row.tier = a.tier;
    coverage.set(label, row);
  }

  return {
    types,
    dependencies,
    reduced,
    languageCoverage: [...coverage.values()],
    fileLanguage: new Map(analyses.map((a) => [a.relativePath, a.language])),
    fileTypeIds: new Map(analyses.map((a) => [a.relativePath, a.types.map((t) => t.id)])),
  };
}

function resolveDependency(
  raw: RawDependency,
  qualifierToFile: Map<string, string>,
  allFiles: Set<string>,
): string | null {
  if (raw.specKind === 'namespace') {
    const direct = qualifierToFile.get(raw.spec);
    if (direct && direct !== raw.fromFile) return direct;
    const parent = raw.spec.split('.').slice(0, -1).join('.');
    if (parent) {
      const viaParent = qualifierToFile.get(parent);
      if (viaParent && viaParent !== raw.fromFile) return viaParent;
    }
    return null;
  }
  if (raw.specKind === 'module-path') {
    return resolveModulePath(raw.fromFile, raw.spec, allFiles);
  }
  return null;
}

function resolveModulePath(fromFile: string, spec: string, allFiles: Set<string>): string | null {
  const fromDir = posixPath.dirname(fromFile);
  const candidates: string[] = [];
  if (spec.startsWith('.')) {
    const joined = posixPath.normalize(posixPath.join(fromDir, spec)).replace(/\\/g, '/');
    candidates.push(
      joined,
      `${joined}.ts`,
      `${joined}.tsx`,
      `${joined}.js`,
      `${joined}.jsx`,
      `${joined}/index.ts`,
      `${joined}/index.js`,
      `${joined}.py`,
    );
  } else {
    const asPath = spec.replace(/\./g, '/');
    for (const prefix of [fromDir === '.' ? '' : `${fromDir}/`, '']) {
      candidates.push(`${prefix}${asPath}.py`, `${prefix}${asPath}/__init__.py`, `${prefix}${spec}`);
    }
  }
  for (const candidate of candidates) {
    const normalized = candidate.replace(/^\.\//, '');
    if (allFiles.has(normalized)) return normalized;
  }
  return null;
}

export async function analyzeAll(
  files: WalkedFile[],
  includeCalls: boolean,
): Promise<FileAnalysis[]> {
  const analyses: FileAnalysis[] = [];
  for (const file of files) {
    analyses.push(await analyzeFile(file, includeCalls));
  }
  return analyses;
}

/** Render + write relations docs and merge relation data into meta.json. */
export async function writeRelationsOutputs(
  config: ScanConfiguration,
  walk: WalkResult,
  model: RelationModel,
  generatedAt: string,
): Promise<string[]> {
  const workspaceName = path.basename(config.workspaceRoot) || config.workspaceRoot;
  const rendered = renderRelations({
    types: model.types,
    dependencies: model.dependencies,
    reduced: model.reduced,
    languageCoverage: model.languageCoverage,
    workspaceName,
    generatedAt,
    maxDocLines: config.maxDocLines,
    exclusions: walk.exclusions,
  });
  const written = await writeDocsAndCleanup(config.workspaceRoot, rendered.docs, 'relations');

  const prior = await readMetadataRaw(config.workspaceRoot);
  const priorByPath = new Map((prior?.files ?? []).map((f) => [f.relativePath, f]));
  const files: FileRecord[] = [];
  for (const file of walk.files) {
    const old = priorByPath.get(file.relativePath);
    const contentHash =
      old && old.size === file.size && old.mtimeMs === file.mtimeMs
        ? old.contentHash
        : await hashFile(file.absolutePath);
    files.push({
      relativePath: file.relativePath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      contentHash,
      language: model.fileLanguage.get(file.relativePath) ?? old?.language ?? null,
      typeIds: model.fileTypeIds.get(file.relativePath) ?? old?.typeIds ?? [],
    });
  }
  await writeMetadata(
    config.workspaceRoot,
    buildMetadata(config, generatedAt, files, {
      types: model.types,
      dependencies: model.dependencies,
      reduced: model.reduced,
    }),
  );
  written.push(META_FILE_REL);
  return written;
}

export function relationsPartitionCount(written: string[]): number {
  return written.filter((w) => w.startsWith('.codemap/relations/')).length;
}

/**
 * scan_relations (T034): auto-detect languages, extract types/relations/imports/calls,
 * resolve cross-file targets, render + write. Degrades gracefully (FR-011).
 */
export async function runScanRelations(
  config: ScanConfiguration,
  includeCalls: boolean,
): Promise<ToolResultReport> {
  const started = Date.now();
  const warnings: string[] = [];
  try {
    const walk = await walkWorkspace(config);
    const generatedAt = nowIso();
    const analyses = await analyzeAll(walk.files, includeCalls);
    const model = resolveModel(analyses, new Set(walk.files.map((f) => f.relativePath)));
    const written = await writeRelationsOutputs(config, walk, model, generatedAt);

    if (model.reduced.length > 0) {
      warnings.push(`${model.reduced.length} file(s) received reduced analysis`);
    }
    return {
      tool: 'scan_relations',
      status: model.reduced.length > 0 ? 'partial' : 'success',
      filesWritten: written,
      counts: {
        types: model.types.length,
        relations: model.types.reduce((n, t) => n + t.relations.length, 0),
        fileDependencies: model.dependencies.length,
        reducedAnalysisFiles: model.reduced.length,
        partitions: relationsPartitionCount(written),
      },
      durationMs: Date.now() - started,
      warnings,
      errors: [],
    };
  } catch (err) {
    return reportError('scan_relations', started, warnings, err);
  }
}
