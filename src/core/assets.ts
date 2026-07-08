import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Grammar/asset path resolution for every install channel (T010, FR-004, research R6).
 *
 * Anchored on import.meta.url of the *compiled* file (dist/core/assets.js →
 * `<package root>/assets/grammars/`), which is immune to CWD, npx cache paths,
 * global installs, `npm link` symlinks, git installs, and container paths.
 * A one-level-up fallback covers source-tree/tsx layouts that nest differently.
 */
export function resolveGrammarsDir(): string {
  const candidates = [
    new URL('../../assets/grammars/', import.meta.url),
    new URL('../../../assets/grammars/', import.meta.url),
  ];
  for (const url of candidates) {
    const dir = fileURLToPath(url);
    if (existsSync(dir)) return dir;
  }
  const expected = fileURLToPath(candidates[0]);
  throw new Error(
    `Grammar assets not found. Expected directory: ${expected}. ` +
      'The package install appears incomplete — reinstall @anhndh1997/workspace-map-mcp ' +
      '(or run `node scripts/fetch-grammars.mjs` in a source checkout).',
  );
}
