import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignoreFactory, { type Ignore } from 'ignore';
import type { ScanConfiguration } from '../types.js';

/**
 * Built-in default exclusions (FR-002, research R5).
 * Matched as path segments anywhere in the tree and NOT overridable by include patterns.
 */
export const BUILT_IN_EXCLUDES: readonly string[] = [
  '.git',
  'node_modules',
  'bin',
  'obj',
  'dist',
  'build',
  'out',
  '.vs',
  '.idea',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'packages',
  '.codemap',
];

export interface ExclusionsSummary {
  builtIn: string[];
  gitignoreFiles: number;
  gitignoreRules: number;
  userInclude: string[];
  userExclude: string[];
}

interface GitignoreLayer {
  /** Directory the .gitignore lives in, workspace-relative ('' = root). */
  base: string;
  ig: Ignore;
}

/**
 * Layered ignore engine: built-in defaults, nested .gitignore files
 * (gitignore semantics via the `ignore` package), then user exclude/include globs.
 */
export class IgnoreEngine {
  private readonly builtIn = new Set(BUILT_IN_EXCLUDES);
  private readonly gitignores: GitignoreLayer[] = [];
  private gitignoreFileCount = 0;
  private gitignoreRuleCount = 0;
  private readonly userExclude: Ignore | null;
  private readonly userInclude: Ignore | null;

  constructor(private readonly config: ScanConfiguration) {
    this.userExclude = config.excludePatterns.length
      ? ignoreFactory().add(config.excludePatterns)
      : null;
    this.userInclude = config.includePatterns.length
      ? ignoreFactory().add(config.includePatterns)
      : null;
  }

  /** Load a .gitignore found in `relDir` (call when the walker enters the directory). */
  async loadGitignore(relDir: string, absDir: string): Promise<void> {
    const gitignorePath = path.join(absDir, '.gitignore');
    let content: string;
    try {
      content = await fs.readFile(gitignorePath, 'utf8');
    } catch {
      return;
    }
    const rules = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (rules.length === 0) return;
    this.gitignores.push({ base: relDir, ig: ignoreFactory().add(rules) });
    this.gitignoreFileCount++;
    this.gitignoreRuleCount += rules.length;
  }

  /**
   * Is `relPath` excluded? Built-ins always win (non-overridable);
   * .gitignore/user excludes can be re-included by user include patterns.
   */
  isExcluded(relPath: string, isDir: boolean): boolean {
    if (relPath === '') return false;
    const segments = relPath.split('/');
    if (segments.some((s) => this.builtIn.has(s))) return true;

    const variants = isDir ? [relPath, `${relPath}/`] : [relPath];
    const reIncluded =
      this.userInclude !== null && variants.some((v) => this.safeIgnores(this.userInclude!, v));

    if (this.userExclude && variants.some((v) => this.safeIgnores(this.userExclude!, v))) {
      if (!reIncluded) return true;
    }

    for (const layer of this.gitignores) {
      let sub: string;
      if (layer.base === '') {
        sub = relPath;
      } else if (relPath === layer.base || relPath.startsWith(`${layer.base}/`)) {
        sub = relPath.slice(layer.base.length + 1);
      } else {
        continue;
      }
      if (!sub) continue;
      const subVariants = isDir ? [sub, `${sub}/`] : [sub];
      if (subVariants.some((v) => this.safeIgnores(layer.ig, v))) {
        if (!reIncluded) return true;
      }
    }
    return false;
  }

  private safeIgnores(ig: Ignore, candidate: string): boolean {
    try {
      return ig.ignores(candidate);
    } catch {
      return false;
    }
  }

  summary(): ExclusionsSummary {
    return {
      builtIn: [...BUILT_IN_EXCLUDES],
      gitignoreFiles: this.gitignoreFileCount,
      gitignoreRules: this.gitignoreRuleCount,
      userInclude: [...this.config.includePatterns],
      userExclude: [...this.config.excludePatterns],
    };
  }
}
