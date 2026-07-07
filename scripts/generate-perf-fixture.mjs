/**
 * Generates a synthetic 10,000-file multi-language workspace for performance testing
 * (SC-003: full scan < 60 s; SC-004: 100-file update < 15 s).
 *
 * Usage: node scripts/generate-perf-fixture.mjs [targetDir] [fileCount]
 * Default target: tests/fixtures/perf-10k (gitignored, generated on demand).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function generatePerfFixture(dir, fileCount = 10000) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const makers = [
    {
      ext: 'cs',
      content: (i) =>
        `namespace Perf.Ns${i % 50}\n{\n    public class Type${i} \n    {\n        public void Run${i}() { Helper.Call(); }\n    }\n}\n`,
    },
    {
      ext: 'ts',
      content: (i) => `export class Type${i} {\n  run(): number {\n    return ${i};\n  }\n}\n`,
    },
    {
      ext: 'py',
      content: (i) => `class Type${i}:\n    def run(self):\n        return ${i}\n`,
    },
    {
      ext: 'go',
      content: (i) => `package pkg${i % 50}\n\ntype Type${i} struct {\n\tValue int\n}\n`,
    },
    {
      ext: 'md',
      content: (i) => `# Doc ${i}\n\nSome documentation text for file ${i}.\n`,
    },
  ];

  for (let i = 0; i < fileCount; i++) {
    const maker = makers[i % makers.length];
    const folder = path.join(dir, `mod${i % 40}`, `sub${i % 8}`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `file${i}.${maker.ext}`), maker.content(i));
  }
  return dir;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const target =
    process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'perf-10k');
  const count = Number(process.argv[3] ?? 10000);
  generatePerfFixture(path.resolve(target), count);
  console.log(`[generate-perf-fixture] wrote ${count} files to ${path.resolve(target)}`);
}
