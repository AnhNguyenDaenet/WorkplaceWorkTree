import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanConfiguration } from '../src/types.js';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function fixturePath(name: string): string {
  return path.join(repoRoot, 'tests', 'fixtures', name);
}

export async function mkTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Copy a fixture into a temp dir so runs never pollute the repo tree. */
export async function copyFixture(name: string, prefix = 'wmap-'): Promise<string> {
  const dest = await mkTmpDir(prefix);
  await fs.cp(fixturePath(name), dest, { recursive: true });
  return dest;
}

export async function rmrf(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export function cfg(root: string, extra?: Partial<ScanConfiguration>): ScanConfiguration {
  return {
    workspaceRoot: root,
    includePatterns: [],
    excludePatterns: [],
    maxDocLines: 1500,
    ...extra,
  };
}

export async function readDoc(root: string, rel: string): Promise<string> {
  return fs.readFile(path.join(root, rel), 'utf8');
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
