import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildMetadata,
  diffFiles,
  hashFile,
  META_VERSION,
  metaPath,
  readMetadata,
  writeMetadata,
} from '../../src/meta/metadata.js';
import { walkWorkspace } from '../../src/core/walker.js';
import type { FileRecord } from '../../src/types.js';
import { cfg, mkTmpDir, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

async function seedWorkspace(): Promise<string> {
  const dir = await mkTmpDir('wmap-meta-');
  tmpDirs.push(dir);
  await fs.writeFile(path.join(dir, 'a.txt'), 'aaa');
  await fs.writeFile(path.join(dir, 'b.txt'), 'bbb');
  return dir;
}

async function recordsFor(dir: string): Promise<FileRecord[]> {
  const walk = await walkWorkspace(cfg(dir));
  const records: FileRecord[] = [];
  for (const f of walk.files) {
    records.push({
      relativePath: f.relativePath,
      size: f.size,
      mtimeMs: f.mtimeMs,
      contentHash: await hashFile(f.absolutePath),
      language: null,
      typeIds: [],
    });
  }
  return records;
}

describe('metadata sidecar', () => {
  it('round-trips meta.json', async () => {
    const dir = await seedWorkspace();
    const config = cfg(dir);
    const meta = buildMetadata(config, new Date().toISOString(), await recordsFor(dir), {
      types: [],
      dependencies: [],
      reduced: [],
    });
    await writeMetadata(dir, meta);
    const result = await readMetadata(dir, config);
    expect(result.fullGenerationRequired).toBe(false);
    expect(result.metadata?.version).toBe(META_VERSION);
    expect(result.metadata?.files.length).toBe(2);
  });

  it('signals full generation when meta.json is missing', async () => {
    const dir = await seedWorkspace();
    const result = await readMetadata(dir, cfg(dir));
    expect(result.fullGenerationRequired).toBe(true);
    expect(result.reason).toMatch(/missing/);
  });

  it('signals full generation on corrupt JSON', async () => {
    const dir = await seedWorkspace();
    await fs.mkdir(path.dirname(metaPath(dir)), { recursive: true });
    await fs.writeFile(metaPath(dir), '{ not json !!');
    const result = await readMetadata(dir, cfg(dir));
    expect(result.fullGenerationRequired).toBe(true);
    expect(result.reason).toMatch(/corrupt/);
  });

  it('signals full generation on version mismatch and config drift', async () => {
    const dir = await seedWorkspace();
    const config = cfg(dir);
    const meta = buildMetadata(config, new Date().toISOString(), [], {
      types: [],
      dependencies: [],
      reduced: [],
    });
    await writeMetadata(dir, { ...meta, version: 999 });
    const mismatch = await readMetadata(dir, config);
    expect(mismatch.fullGenerationRequired).toBe(true);
    expect(mismatch.reason).toMatch(/version mismatch/);

    await writeMetadata(dir, meta);
    const drift = await readMetadata(dir, cfg(dir, { excludePatterns: ['x/**'] }));
    expect(drift.fullGenerationRequired).toBe(true);
    expect(drift.reason).toMatch(/configuration changed/);
  });

  it('diffFiles classifies added/changed/removed/unchanged (T038)', async () => {
    const dir = await seedWorkspace();
    const records = await recordsFor(dir);

    await fs.writeFile(path.join(dir, 'c.txt'), 'ccc'); // added
    await fs.writeFile(path.join(dir, 'a.txt'), 'AAA-changed'); // changed
    await fs.rm(path.join(dir, 'b.txt')); // removed

    const walk = await walkWorkspace(cfg(dir));
    const diff = await diffFiles(records, walk.files);
    expect(diff.added.map((f) => f.relativePath)).toEqual(['c.txt']);
    expect(diff.changed.map((f) => f.relativePath)).toEqual(['a.txt']);
    expect(diff.removed.map((f) => f.relativePath)).toEqual(['b.txt']);
    expect(diff.unchanged).toEqual([]);
  });

  it('treats stat-changed but hash-identical files as unchanged', async () => {
    const dir = await seedWorkspace();
    const records = await recordsFor(dir);
    // Rewrite identical content -> mtime changes, hash does not.
    await fs.writeFile(path.join(dir, 'a.txt'), 'aaa');
    const walk = await walkWorkspace(cfg(dir));
    const diff = await diffFiles(records, walk.files);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.unchanged.map((u) => u.relativePath).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
