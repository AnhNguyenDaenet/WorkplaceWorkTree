#!/usr/bin/env node
/**
 * Guarded build for the npm `prepare` lifecycle (T008, research R2).
 *
 * - Skips compilation when dist/index.js exists and is newer than every src/**\/*.ts
 *   (fast everyday `npm install` in the repo).
 * - Otherwise compiles with the locally installed TypeScript (git installs have
 *   devDependencies available per npm behavior).
 * - Never fails the install when tsc is unavailable but a usable dist/ exists
 *   (registry tarballs ship prebuilt and must not require a toolchain — FR-001).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = path.join(root, 'dist', 'index.js');
const srcDir = path.join(root, 'src');

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

const distUsable = existsSync(distEntry);
const haveSources = existsSync(srcDir);

if (distUsable && haveSources && statSync(distEntry).mtimeMs >= newestMtime(srcDir)) {
  console.log('[build-if-needed] dist/ is up to date; skipping compile.');
  process.exit(0);
}
if (distUsable && !haveSources) {
  // Registry tarball layout: prebuilt dist/, no src/ — nothing to do.
  process.exit(0);
}

const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
if (!existsSync(tscJs)) {
  if (distUsable) {
    console.warn('[build-if-needed] TypeScript unavailable; keeping existing dist/ (usable).');
    process.exit(0);
  }
  console.error(
    '[build-if-needed] No dist/ and TypeScript is not installed — run `npm install` (with devDependencies) and retry.',
  );
  process.exit(1);
}

console.log('[build-if-needed] compiling with tsc…');
const result = spawnSync(process.execPath, [tscJs, '-p', path.join(root, 'tsconfig.json')], {
  stdio: 'inherit',
  cwd: root,
});
process.exit(result.status ?? 1);
