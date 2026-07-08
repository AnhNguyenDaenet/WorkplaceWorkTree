import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
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

/** Copy a fixture into `<tmp>/<name>` so two copies share an identical root folder name. */
export async function copyFixtureNamed(
  fixture: string,
  rootName: string,
  prefix = 'wmap-',
): Promise<string> {
  const parent = await mkTmpDir(prefix);
  const dest = path.join(parent, rootName);
  await fs.cp(fixturePath(fixture), dest, { recursive: true });
  return dest;
}

/** Find an ephemeral free TCP port on loopback. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export type SpawnedServer = ChildProcess & { stderrText: () => string };

/** Spawn the server from source (tsx) with captured stderr. */
export function spawnServer(args: string[]): SpawnedServer {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', ...args], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  }) as SpawnedServer;
  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stderrText = () => stderr;
  return child;
}

/** Wait until the spawned server logs its ready line (or fail fast on early exit). */
export async function waitForReady(child: SpawnedServer): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.stderrText().includes('ready —')) return;
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}): ${child.stderrText()}`);
    }
    await sleep(100);
  }
  throw new Error(`server not ready in time: ${child.stderrText()}`);
}
