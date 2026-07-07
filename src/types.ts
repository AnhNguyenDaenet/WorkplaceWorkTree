/**
 * Shared model types for workspace-map-mcp.
 * Field definitions follow specs/001-workspace-map-mcp/data-model.md.
 */

export interface ScanConfiguration {
  /** Absolute path to the workspace root being mapped. */
  workspaceRoot: string;
  /** Extra include (re-include) glob patterns, gitignore syntax. */
  includePatterns: string[];
  /** Extra exclude glob patterns, gitignore syntax. */
  excludePatterns: string[];
  /** Partition threshold: max lines per generated document (FR-015). */
  maxDocLines: number;
}

export type TreeEntryKind = 'folder' | 'file' | 'symlink';

export interface TreeEntry {
  name: string;
  /** Workspace-relative path with `/` separators; empty string for the root. */
  relativePath: string;
  kind: TreeEntryKind;
  children?: TreeEntry[];
}

export type TypeKind =
  | 'class'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'type'
  | 'function-module';

export interface TypeRelation {
  kind: 'inherits' | 'implements';
  /** Target type name as written in source. */
  targetName: string;
  /** Resolved TypeEntry id when the target is defined in the workspace; null for external types. */
  targetId: string | null;
}

export interface CallReference {
  methodName: string;
  targetTypeName: string | null;
  /** v1 call extraction is name-based (no semantic resolution). */
  confidence: 'syntactic';
}

export interface TypeEntry {
  /** `<language>:<qualifier>.<TypeName>@<relativePath>` — unique (FR-013). */
  id: string;
  name: string;
  /** Namespace (C#/Java), module path (TS/Python/Go/Rust); '' when global. */
  qualifier: string;
  kind: TypeKind;
  language: string;
  /** Workspace-relative defining file path (FR-004). */
  definingFile: string;
  relations: TypeRelation[];
  calls: CallReference[];
}

export interface FileDependency {
  fromFile: string;
  /** Resolved workspace-relative path; null when external (package import). */
  toFile: string | null;
  /** The import/using text as written. */
  rawSpecifier: string;
}

export interface ReducedAnalysisFile {
  relativePath: string;
  reason: string;
}

export interface FileRecord {
  relativePath: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
  language: string | null;
  /** TypeEntry ids defined in this file — enables stale-entry eviction (US3-AS2). */
  typeIds: string[];
}

/**
 * Machine-readable sidecar (.codemap/meta.json) enabling incremental updates.
 * Not covered by the map format-stability promise; guarded by `version`.
 * Note: the full relation model (types/dependencies/reduced) is persisted here so
 * incremental updates can re-render without re-parsing unchanged files (research R8).
 */
export interface MapMetadata {
  version: number;
  generatedAt: string;
  workspaceRoot: string;
  config: Pick<ScanConfiguration, 'includePatterns' | 'excludePatterns' | 'maxDocLines'>;
  files: FileRecord[];
  types: TypeEntry[];
  dependencies: FileDependency[];
  reduced: ReducedAnalysisFile[];
}

export type ToolStatus = 'success' | 'partial' | 'error';

export interface ToolResultReport {
  tool: string;
  status: ToolStatus;
  /** Workspace-relative paths with `/` separators. */
  filesWritten: string[];
  counts: Record<string, number | string>;
  durationMs: number;
  warnings: string[];
  errors: string[];
}
