import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Atomically write a file: write to `<name>.tmp` in the same directory, then rename.
 * Same-volume rename is atomic on NTFS and POSIX, so an interrupted run never leaves
 * a previously valid file half-overwritten (FR-014, research R7).
 */
export async function atomicWriteFile(absPath: string, content: string): Promise<void> {
  const dir = path.dirname(absPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}
