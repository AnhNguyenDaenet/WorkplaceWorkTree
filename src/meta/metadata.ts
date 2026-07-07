import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../core/atomicWrite.js';
import type { WalkedFile } from '../core/walker.js';
import { CODEMAP_DIR } from '../version.js';
import type { FileRecord, MapMetadata, ScanConfiguration } from '../types.js';

export const META_VERSION = 1;
export const META_FILE = 'meta.json';

export interface MetaReadResult {
  metadata: MapMetadata | null;
  /** True when incremental update is impossible: missing/corrupt/version-mismatch/config-drift. */
  fullGenerationRequired: boolean;
  reason: string | null;
}

export function metaPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CODEMAP_DIR, META_FILE);
}

export async function hashFile(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return createHash('sha1').update(buf).digest('hex');
}

function configSnapshot(config: ScanConfiguration): MapMetadata['config'] {
  return {
    includePatterns: [...config.includePatterns],
    excludePatterns: [...config.excludePatterns],
    maxDocLines: config.maxDocLines,
  };
}

function configMatches(a: MapMetadata['config'], b: MapMetadata['config']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Read meta.json leniently (no validity checks) — used for merge-preserving writes. */
export async function readMetadataRaw(workspaceRoot: string): Promise<MapMetadata | null> {
  try {
    const raw = await fs.readFile(metaPath(workspaceRoot), 'utf8');
    const parsed = JSON.parse(raw) as MapMetadata;
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read and validate meta.json for incremental updates (data-model §4 state transitions). */
export async function readMetadata(
  workspaceRoot: string,
  config: ScanConfiguration,
): Promise<MetaReadResult> {
  let raw: string;
  try {
    raw = await fs.readFile(metaPath(workspaceRoot), 'utf8');
  } catch {
    return { metadata: null, fullGenerationRequired: true, reason: 'meta.json missing' };
  }
  let parsed: MapMetadata;
  try {
    parsed = JSON.parse(raw) as MapMetadata;
  } catch {
    return { metadata: null, fullGenerationRequired: true, reason: 'meta.json corrupt (invalid JSON)' };
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.files)) {
    return { metadata: null, fullGenerationRequired: true, reason: 'meta.json corrupt (unexpected shape)' };
  }
  if (parsed.version !== META_VERSION) {
    return {
      metadata: null,
      fullGenerationRequired: true,
      reason: `meta.json version mismatch (found ${parsed.version}, expected ${META_VERSION})`,
    };
  }
  if (!configMatches(parsed.config, configSnapshot(config))) {
    return { metadata: null, fullGenerationRequired: true, reason: 'scan configuration changed' };
  }
  return { metadata: parsed, fullGenerationRequired: false, reason: null };
}

export async function writeMetadata(workspaceRoot: string, meta: MapMetadata): Promise<void> {
  await atomicWriteFile(metaPath(workspaceRoot), JSON.stringify(meta, null, 2));
}

export function buildMetadata(
  config: ScanConfiguration,
  generatedAt: string,
  files: FileRecord[],
  model: Pick<MapMetadata, 'types' | 'dependencies' | 'reduced'>,
): MapMetadata {
  return {
    version: META_VERSION,
    generatedAt,
    workspaceRoot: config.workspaceRoot,
    config: configSnapshot(config),
    files,
    types: model.types,
    dependencies: model.dependencies,
    reduced: model.reduced,
  };
}

export interface FileDiff {
  added: WalkedFile[];
  changed: WalkedFile[];
  removed: FileRecord[];
  /** Records for unchanged files, stat-refreshed where hash confirmed equality. */
  unchanged: FileRecord[];
}

/**
 * Classify a fresh walk against stored records (T038, research R8):
 * size/mtime pre-filter, contentHash confirmation for candidates.
 */
export async function diffFiles(records: FileRecord[], walked: WalkedFile[]): Promise<FileDiff> {
  const byPath = new Map(records.map((r) => [r.relativePath, r]));
  const seen = new Set<string>();
  const added: WalkedFile[] = [];
  const changed: WalkedFile[] = [];
  const unchanged: FileRecord[] = [];

  for (const file of walked) {
    const old = byPath.get(file.relativePath);
    seen.add(file.relativePath);
    if (!old) {
      added.push(file);
      continue;
    }
    if (old.size === file.size && old.mtimeMs === file.mtimeMs) {
      unchanged.push(old);
      continue;
    }
    const hash = await hashFile(file.absolutePath);
    if (hash === old.contentHash) {
      unchanged.push({ ...old, size: file.size, mtimeMs: file.mtimeMs });
    } else {
      changed.push(file);
    }
  }

  const removed = records.filter((r) => !seen.has(r.relativePath));
  return { added, changed, removed, unchanged };
}

/** Type ids defined in files that were removed or changed — these entries are stale (US3-AS2). */
export function staleTypeIds(diff: FileDiff): Set<string> {
  const stale = new Set<string>();
  for (const rec of diff.removed) for (const id of rec.typeIds) stale.add(id);
  return stale;
}
