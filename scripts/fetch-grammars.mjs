#!/usr/bin/env node
/**
 * Copies tree-sitter WASM grammars from the tree-sitter-wasms package into assets/grammars/.
 * The .wasm files are committed so installs are fully offline (research R3, R12).
 *
 * Usage: node scripts/fetch-grammars.mjs [--soft]
 *   --soft: exit 0 even when grammars can't be refreshed, as long as they already exist.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'grammars');
const soft = process.argv.includes('--soft');

// language id -> wasm file name inside tree-sitter-wasms/out/
const GRAMMARS = {
  csharp: 'tree-sitter-c_sharp.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  java: 'tree-sitter-java.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
};

const allPresent = Object.values(GRAMMARS).every((f) => existsSync(path.join(outDir, f)));

const srcDir = path.join(root, 'node_modules', 'tree-sitter-wasms', 'out');
if (!existsSync(srcDir)) {
  if (allPresent || soft) {
    if (!allPresent) {
      console.warn('[fetch-grammars] tree-sitter-wasms not installed and grammars missing; run npm install with devDependencies.');
    }
    process.exit(0);
  }
  console.error('[fetch-grammars] tree-sitter-wasms package not found; install devDependencies first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const file of Object.values(GRAMMARS)) {
  const src = path.join(srcDir, file);
  if (!existsSync(src)) {
    console.error(`[fetch-grammars] missing grammar in package: ${file}`);
    if (!soft) process.exit(1);
    continue;
  }
  copyFileSync(src, path.join(outDir, file));
  copied++;
}
console.log(`[fetch-grammars] copied ${copied} grammar(s) to assets/grammars/`);
