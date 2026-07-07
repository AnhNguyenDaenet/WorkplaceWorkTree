import type { ExclusionsSummary } from '../core/ignoreRules.js';
import type {
  FileDependency,
  ReducedAnalysisFile,
  TypeEntry,
} from '../types.js';
import { renderHeader, codemapPath } from './header.js';
import { needsPartition, partitionDocRelPath, type RenderedDocs } from './partition.js';

export interface LanguageCoverageRow {
  language: string;
  files: number;
  tier: 'deep' | 'fallback' | 'none';
}

export interface RelationsRenderInput {
  types: TypeEntry[];
  dependencies: FileDependency[];
  reduced: ReducedAnalysisFile[];
  languageCoverage: LanguageCoverageRow[];
  workspaceName: string;
  generatedAt: string;
  maxDocLines: number;
  exclusions: ExclusionsSummary;
}

function qualifiedName(t: TypeEntry): string {
  return t.qualifier ? `${t.qualifier}.${t.name}` : t.name;
}

function relationTarget(rel: { targetName: string; targetId: string | null }, byId: Map<string, TypeEntry>): string {
  if (rel.targetId) {
    const target = byId.get(rel.targetId);
    if (target) {
      return `\`${rel.targetName}\` → \`${qualifiedName(target)}\` (${target.definingFile})`;
    }
  }
  return `\`${rel.targetName}\` → (external)`;
}

function typeSection(t: TypeEntry, byId: Map<string, TypeEntry>): string[] {
  const lines: string[] = [];
  lines.push(`### \`${qualifiedName(t)}\` (${t.kind}, ${t.language}) — ${t.definingFile}`);
  lines.push('');
  const inherits = t.relations.filter((r) => r.kind === 'inherits');
  const implement = t.relations.filter((r) => r.kind === 'implements');
  if (inherits.length) {
    lines.push(`- **Inherits**: ${inherits.map((r) => relationTarget(r, byId)).join(', ')}`);
  }
  if (implement.length) {
    lines.push(`- **Implements**: ${implement.map((r) => relationTarget(r, byId)).join(', ')}`);
  }
  if (t.calls.length) {
    const rendered = t.calls
      .slice(0, 20)
      .map((c) => `\`${c.targetTypeName ? `${c.targetTypeName}.` : ''}${c.methodName}\``)
      .join(', ');
    lines.push(`- **Calls** *(syntactic, best-effort)*: ${rendered}`);
  }
  if (!inherits.length && !implement.length && !t.calls.length) {
    lines.push('- No recorded relations.');
  }
  lines.push('');
  return lines;
}

function topLevelFolderOf(relPath: string): string {
  const idx = relPath.indexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}

/**
 * Render `.codemap/relations.md` (FR-003, FR-004, FR-011, FR-013).
 * Partitioned per top-level folder when large; the type index (the navigation-critical
 * piece) always stays whole in the root document (contracts/map-formats.md).
 */
export function renderRelations(input: RelationsRenderInput): RenderedDocs {
  const { types, dependencies, reduced, languageCoverage, workspaceName, generatedAt, maxDocLines, exclusions } =
    input;

  const sorted = [...types].sort((a, b) =>
    qualifiedName(a).toLowerCase().localeCompare(qualifiedName(b).toLowerCase()),
  );
  const byId = new Map(sorted.map((t) => [t.id, t]));
  const relationCount = sorted.reduce((n, t) => n + t.relations.length, 0);

  const metrics: Array<[string, number | string]> = [
    ['Types', sorted.length],
    ['Relations', relationCount],
    ['File dependencies', dependencies.length],
    ['Reduced-analysis files', reduced.length],
  ];

  const coverage: string[] = ['## Language coverage', ''];
  if (languageCoverage.length === 0) {
    coverage.push('_No files analyzed._', '');
  } else {
    coverage.push('| Language | Files | Analysis tier |', '|---|---|---|');
    for (const row of [...languageCoverage].sort((a, b) => b.files - a.files)) {
      const tierLabel = row.tier === 'fallback' ? 'fallback (imports only)' : row.tier;
      coverage.push(`| ${row.language} | ${row.files} | ${tierLabel} |`);
    }
    coverage.push('');
  }

  const analyzable = languageCoverage.some((r) => r.tier === 'deep' || r.tier === 'fallback');
  if (!analyzable && sorted.length === 0) {
    coverage.push('> No analyzable source code found in this workspace.', '');
  }

  const index: string[] = ['## Type index', ''];
  if (sorted.length === 0) {
    index.push('_No types found._', '');
  } else {
    index.push('| Type | Kind | Qualifier | Defined in |', '|---|---|---|---|');
    for (const t of sorted) {
      index.push(`| \`${t.name}\` | ${t.kind} | \`${t.qualifier || '(global)'}\` | ${t.definingFile} |`);
    }
    index.push('');
    const collisions = new Map<string, number>();
    for (const t of sorted) collisions.set(t.name, (collisions.get(t.name) ?? 0) + 1);
    if ([...collisions.values()].some((n) => n > 1)) {
      index.push(
        '> ⚠ Name collisions are listed with full qualifiers — always confirm the qualifier before navigating.',
        '',
      );
    }
  }

  const depsSection: string[] = ['## File dependencies', ''];
  if (dependencies.length === 0) {
    depsSection.push('_None recorded._', '');
  } else {
    depsSection.push('| From | To | Via |', '|---|---|---|');
    for (const d of dependencies) {
      depsSection.push(`| ${d.fromFile} | ${d.toFile ?? '(external)'} | \`${d.rawSpecifier}\` |`);
    }
    depsSection.push('');
  }

  const reducedSection: string[] = ['## Reduced analysis', ''];
  if (reduced.length === 0) {
    reducedSection.push('_None — all analyzed files received full analysis._', '');
  } else {
    for (const r of reduced) {
      reducedSection.push(`- ${r.relativePath} — ${r.reason}`);
    }
    reducedSection.push('');
  }

  const allTypeSections = sorted.flatMap((t) => typeSection(t, byId));

  const buildRoot = (partitionRows: string[] | null, typeBody: string[]): string =>
    [
      ...renderHeader('Code Relation Map', generatedAt, workspaceName, metrics, exclusions),
      ...coverage,
      ...index,
      ...(partitionRows ?? []),
      '## Types',
      '',
      ...typeBody,
      ...depsSection,
      ...reducedSection,
    ].join('\n');

  const fullDoc = buildRoot(null, allTypeSections);
  if (!needsPartition(fullDoc, maxDocLines)) {
    return { docs: new Map([[codemapPath('relations.md'), fullDoc]]), partitions: 0 };
  }

  // Partitioned: per-type detail sections move to relations/<top-folder>.md.
  const groups = new Map<string, TypeEntry[]>();
  for (const t of sorted) {
    const folder = topLevelFolderOf(t.definingFile);
    const list = groups.get(folder) ?? [];
    list.push(t);
    groups.set(folder, list);
  }

  const docs = new Map<string, string>();
  const partitionRows: string[] = ['## Partitions', '', '| Folder | Document | Types |', '|---|---|---|'];
  for (const [folder, groupTypes] of groups) {
    const rel = partitionDocRelPath('relations', folder || '_root');
    partitionRows.push(
      `| ${folder ? `${folder}/` : '(root)'} | [${rel}](../${rel.replace('.codemap/', '')}) | ${groupTypes.length} |`,
    );
    docs.set(
      rel,
      [
        ...renderHeader(
          `Code Relation Map — ${folder ? `${folder}/` : 'root files'}`,
          generatedAt,
          workspaceName,
          [['Types', groupTypes.length]],
          exclusions,
        ),
        '## Types',
        '',
        ...groupTypes.flatMap((t) => typeSection(t, byId)),
      ].join('\n'),
    );
  }
  partitionRows.push('');

  const indexDoc = buildRoot(partitionRows, ['_Type detail sections are split into partition documents (see Partitions)._', '']);
  docs.set(codemapPath('relations.md'), indexDoc);
  return { docs, partitions: groups.size };
}
