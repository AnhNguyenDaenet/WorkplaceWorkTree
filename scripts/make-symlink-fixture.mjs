/**
 * Creates a symlink-cycle fixture workspace (junction on Windows, so no admin needed).
 * Layout:
 *   <dir>/a/file.txt
 *   <dir>/a/loop  -> <dir>   (directory junction creating a cycle)
 *
 * Exported for test setup; also runnable standalone:
 *   node scripts/make-symlink-fixture.mjs <targetDir>
 */
import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function createSymlinkFixture(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'a'), { recursive: true });
  writeFileSync(path.join(dir, 'a', 'file.txt'), 'hello\n');
  const linkPath = path.join(dir, 'a', 'loop');
  if (!existsSync(linkPath)) {
    // 'junction' works on Windows without elevation; on POSIX it falls back to a dir symlink.
    symlinkSync(dir, linkPath, 'junction');
  }
  return dir;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const target =
    process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'symlink-cycle');
  createSymlinkFixture(path.resolve(target));
  console.log(`[make-symlink-fixture] created at ${path.resolve(target)}`);
}
