import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { IgnoreEngine, type ExclusionsSummary } from './ignoreRules.js';
import type { ScanConfiguration, TreeEntry } from '../types.js';

export interface WalkedFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
}

export interface WalkResult {
  root: TreeEntry;
  folderCount: number;
  fileCount: number;
  files: WalkedFile[];
  exclusions: ExclusionsSummary;
}

/** Actionable, user-facing traversal error (US1-AS4). */
export class WalkError extends Error {}

interface QueueItem {
  abs: string;
  rel: string;
  entry: TreeEntry;
}

/**
 * Iterative BFS workspace traversal (research R6):
 * - layered ignore rules (built-ins, nested .gitignore, user patterns)
 * - symlink/junction cycle guard via realpath visited-set; links recorded once
 * - deterministic ordering: folders before files, case-insensitive alphabetical
 */
export async function walkWorkspace(config: ScanConfiguration): Promise<WalkResult> {
  const rootAbs = config.workspaceRoot;

  let rootStat;
  try {
    rootStat = await fs.stat(rootAbs);
  } catch {
    throw new WalkError(
      `Workspace root not found or unreadable: "${rootAbs}". Provide an existing, readable directory as an absolute path.`,
    );
  }
  if (!rootStat.isDirectory()) {
    throw new WalkError(`Workspace root is not a directory: "${rootAbs}".`);
  }
  try {
    await fs.access(rootAbs, fsConstants.R_OK);
  } catch {
    throw new WalkError(`Workspace root is not readable: "${rootAbs}". Check permissions.`);
  }

  const engine = new IgnoreEngine(config);
  const rootEntry: TreeEntry = {
    name: path.basename(rootAbs) || rootAbs,
    relativePath: '',
    kind: 'folder',
    children: [],
  };

  const visitedReal = new Set<string>([await fs.realpath(rootAbs)]);
  const queue: QueueItem[] = [{ abs: rootAbs, rel: '', entry: rootEntry }];
  const files: WalkedFile[] = [];
  let folderCount = 0;
  let fileCount = 0;

  while (queue.length > 0) {
    const { abs, rel, entry } = queue.shift()!;
    let dirents;
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      continue; // unreadable subdirectory: skip rather than abort
    }

    if (dirents.some((d) => d.name === '.gitignore')) {
      await engine.loadGitignore(rel, abs);
    }

    const sorted = [...dirents].sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1;
      const bDir = b.isDirectory() ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : a.name < b.name ? -1 : 1;
    });

    for (const dirent of sorted) {
      const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      const childAbs = path.join(abs, dirent.name);
      const isLink = dirent.isSymbolicLink();
      let isDir = dirent.isDirectory();
      if (isLink) {
        try {
          isDir = (await fs.stat(childAbs)).isDirectory();
        } catch {
          continue; // broken link
        }
      }
      if (engine.isExcluded(childRel, isDir)) continue;

      if (isDir) {
        let real: string;
        try {
          real = await fs.realpath(childAbs);
        } catch {
          continue;
        }
        if (visitedReal.has(real)) {
          entry.children!.push({ name: dirent.name, relativePath: childRel, kind: 'symlink' });
          continue;
        }
        visitedReal.add(real);
        const childEntry: TreeEntry = {
          name: dirent.name,
          relativePath: childRel,
          kind: 'folder',
          children: [],
        };
        entry.children!.push(childEntry);
        folderCount++;
        queue.push({ abs: childAbs, rel: childRel, entry: childEntry });
      } else if (dirent.isFile() || isLink) {
        let stat;
        try {
          stat = await fs.stat(childAbs);
        } catch {
          continue;
        }
        entry.children!.push({ name: dirent.name, relativePath: childRel, kind: 'file' });
        files.push({
          relativePath: childRel,
          absolutePath: childAbs,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
        fileCount++;
      }
    }
  }

  return { root: rootEntry, folderCount, fileCount, files, exclusions: engine.summary() };
}
