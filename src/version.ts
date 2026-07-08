import { readFileSync } from 'node:fs';

/**
 * VERSION is read from package.json at module load (FR-015): one source of truth
 * across every channel. Resolution is import.meta.url-relative, so it works from
 * dist/version.js (installed package) and src/version.ts (tsx) alike.
 */
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };

export const VERSION: string = pkg.version;
export const PACKAGE_NAME: string = pkg.name;
export const SERVER_NAME = 'workspace-map-mcp';
export const MAP_FORMAT_VERSION = 1;
export const CODEMAP_DIR = '.codemap';
export const DEFAULT_MAX_DOC_LINES = 1500;
