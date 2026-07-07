import type { WalkResult } from '../core/walker.js';
import type { TreeEntry } from '../types.js';
import { renderHeader, codemapPath } from './header.js';
import { needsPartition, partitionDocRelPath, type RenderedDocs } from './partition.js';

export interface StructureRenderInput {
  walk: WalkResult;
  workspaceName: string;
  generatedAt: string;
  maxDocLines: number;
}

const FILE_NAME_PAD = 34;

/** Render one entry's line; files carry a `# relative/path` comment (FR-001). */
function entryLine(prefix: string, connector: string, entry: TreeEntry): string {
  if (entry.kind === 'symlink') {
    return `${prefix}${connector}${entry.name}/ → (symlink, recorded once)`;
  }
  if (entry.kind === 'folder') {
    return `${prefix}${connector}${entry.name}/`;
  }
  const base = `${prefix}${connector}${entry.name}`;
  const padded = base.length < FILE_NAME_PAD ? base.padEnd(FILE_NAME_PAD) : `${base} `;
  return `${padded} # ${entry.relativePath}`;
}

function renderSubtree(entry: TreeEntry, prefix: string, lines: string[]): void {
  const children = entry.children ?? [];
  children.forEach((child, i) => {
    const last = i === children.length - 1;
    const connector = last ? '└── ' : '├── ';
    lines.push(entryLine(prefix, connector, child));
    if (child.kind === 'folder') {
      renderSubtree(child, prefix + (last ? '    ' : '│   '), lines);
    }
  });
}

function treeBlock(rootLabel: string, body: (lines: string[]) => void): string[] {
  const lines: string[] = ['```text', `${rootLabel}/`];
  body(lines);
  lines.push('```');
  return lines;
}

function countFiles(entry: TreeEntry): number {
  let n = 0;
  for (const child of entry.children ?? []) {
    if (child.kind === 'file') n++;
    else if (child.kind === 'folder') n += countFiles(child);
  }
  return n;
}

/**
 * Render `.codemap/structure.md`, partitioned per top-level folder when the
 * document would exceed maxDocLines (FR-015, contracts/map-formats.md).
 */
export function renderStructure(input: StructureRenderInput): RenderedDocs {
  const { walk, workspaceName, generatedAt, maxDocLines } = input;

  const fullTreeLines: string[] = [];
  renderSubtree(walk.root, '', fullTreeLines);

  const buildDoc = (metrics: Array<[string, number | string]>, bodyLines: string[]): string =>
    [
      ...renderHeader('Workspace Structure Map', generatedAt, workspaceName, metrics, walk.exclusions),
      ...bodyLines,
      '',
    ].join('\n');

  const fullDoc = buildDoc(
    [
      ['Folders', walk.folderCount],
      ['Files', walk.fileCount],
      ['Partitions', 0],
    ],
    ['## Tree', '', ...treeBlock(workspaceName, (l) => l.push(...fullTreeLines))],
  );

  if (!needsPartition(fullDoc, maxDocLines)) {
    return { docs: new Map([[codemapPath('structure.md'), fullDoc]]), partitions: 0 };
  }

  // Partitioned form: index doc + one doc per top-level folder.
  const docs = new Map<string, string>();
  const topFolders = (walk.root.children ?? []).filter((c) => c.kind === 'folder');
  const partitionRows: string[] = ['| Folder | Document | Files |', '|---|---|---|'];

  for (const folder of topFolders) {
    const rel = partitionDocRelPath('structure', folder.name);
    partitionRows.push(`| ${folder.name}/ | [${rel}](../${rel.replace('.codemap/', '')}) | ${countFiles(folder)} |`);
    const partLines: string[] = [];
    renderSubtree(folder, '', partLines);
    docs.set(
      rel,
      [
        ...renderHeader(
          `Workspace Structure Map — ${folder.name}/`,
          generatedAt,
          workspaceName,
          [['Files', countFiles(folder)]],
          walk.exclusions,
        ),
        '## Tree',
        '',
        ...treeBlock(`${workspaceName}/${folder.name}`, (l) => l.push(...partLines)),
        '',
      ].join('\n'),
    );
  }

  const topLevelLines: string[] = [];
  (walk.root.children ?? []).forEach((child, i) => {
    const last = i === (walk.root.children?.length ?? 0) - 1;
    const connector = last ? '└── ' : '├── ';
    topLevelLines.push(entryLine('', connector, child));
  });

  const indexDoc = buildDoc(
    [
      ['Folders', walk.folderCount],
      ['Files', walk.fileCount],
      ['Partitions', topFolders.length],
    ],
    [
      '## Partitions',
      '',
      ...partitionRows,
      '',
      '## Tree (top level)',
      '',
      ...treeBlock(workspaceName, (l) => l.push(...topLevelLines)),
    ],
  );
  docs.set(codemapPath('structure.md'), indexDoc);
  return { docs, partitions: topFolders.length };
}
