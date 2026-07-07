import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { atomicWriteFile } from '../../src/core/atomicWrite.js';
import { exists, mkTmpDir, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('atomicWriteFile', () => {
  it('writes content and leaves no .tmp file behind', async () => {
    const dir = await mkTmpDir('wmap-aw-');
    tmpDirs.push(dir);
    const target = path.join(dir, 'sub', 'doc.md');
    await atomicWriteFile(target, 'hello');
    expect(await fs.readFile(target, 'utf8')).toBe('hello');
    expect(await exists(`${target}.tmp`)).toBe(false);
  });

  it('atomically replaces an existing file', async () => {
    const dir = await mkTmpDir('wmap-aw-');
    tmpDirs.push(dir);
    const target = path.join(dir, 'doc.md');
    await atomicWriteFile(target, 'v1');
    await atomicWriteFile(target, 'v2');
    expect(await fs.readFile(target, 'utf8')).toBe('v2');
  });

  it('fails without corrupting anything when the destination is invalid', async () => {
    const dir = await mkTmpDir('wmap-aw-');
    tmpDirs.push(dir);
    const blocker = path.join(dir, 'blocker');
    await fs.writeFile(blocker, 'i am a file');
    // Parent "directory" is actually a file -> mkdir/write must fail.
    await expect(atomicWriteFile(path.join(blocker, 'doc.md'), 'x')).rejects.toThrow();
    expect(await fs.readFile(blocker, 'utf8')).toBe('i am a file');
  });
});
