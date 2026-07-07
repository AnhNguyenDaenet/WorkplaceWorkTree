import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AsyncMutex } from '../../src/core/mutex.js';
import { runScanRelations } from '../../src/tools/scanRelations.js';
import { runScanStructure } from '../../src/tools/scanStructure.js';
import { runUpdateMaps } from '../../src/tools/updateMaps.js';
import { cfg, copyFixture, readDoc, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

async function generateBoth(dir: string): Promise<void> {
  const s = await runScanStructure(cfg(dir));
  expect(s.status).toBe('success');
  const r = await runScanRelations(cfg(dir), true);
  expect(['success', 'partial']).toContain(r.status);
}

describe('update_maps integration (US3)', () => {
  it('US3-AS1: newly added source file appears in both maps after update', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    await generateBoth(dir);

    await fs.writeFile(
      path.join(dir, 'src', 'csharp', 'NewThing.cs'),
      'namespace Contoso.Orders\n{\n    public class NewThing : ServiceBase\n    {\n    }\n}\n',
    );
    const report = await runUpdateMaps(cfg(dir), false);
    expect(report.counts.mode).toBe('incremental');
    expect(report.counts.added).toBe(1);

    const structure = await readDoc(dir, '.codemap/structure.md');
    expect(structure).toContain('# src/csharp/NewThing.cs');
    const relations = await readDoc(dir, '.codemap/relations.md');
    expect(relations).toContain('| `NewThing` | class | `Contoso.Orders` | src/csharp/NewThing.cs |');
    expect(relations).toContain('`ServiceBase` → `Contoso.Core.ServiceBase`');
  });

  it('US3-AS2: renamed + deleted files leave zero stale entries in either document', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    await generateBoth(dir);

    // Rename OrderService.cs -> OrderCore.cs; delete zoo.py.
    await fs.rename(
      path.join(dir, 'src', 'csharp', 'OrderService.cs'),
      path.join(dir, 'src', 'csharp', 'OrderCore.cs'),
    );
    await fs.rm(path.join(dir, 'src', 'py', 'zoo.py'));

    const report = await runUpdateMaps(cfg(dir), false);
    expect(report.counts.mode).toBe('incremental');
    expect(report.counts.added).toBe(1); // OrderCore.cs
    expect(report.counts.removed).toBe(2); // OrderService.cs + zoo.py

    const structure = await readDoc(dir, '.codemap/structure.md');
    // '/OrderService.cs' avoids matching 'IOrderService.cs'.
    expect(structure).not.toContain('/OrderService.cs');
    expect(structure).not.toContain('zoo.py');
    expect(structure).toContain('# src/csharp/OrderCore.cs');

    const relations = await readDoc(dir, '.codemap/relations.md');
    expect(relations).not.toContain('/OrderService.cs');
    expect(relations).not.toContain('zoo.py');
    expect(relations).not.toContain('`Dog`');
    // The OrderService class now lives in OrderCore.cs.
    expect(relations).toContain(
      '| `OrderService` | class | `Contoso.Orders` | src/csharp/OrderCore.cs |',
    );
  });

  it('US3-AS3: with no meta.json, update falls back to full generation', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    const report = await runUpdateMaps(cfg(dir), false);
    expect(report.counts.mode).toBe('full');
    expect(report.warnings.some((w) => w.includes('full generation'))).toBe(true);
    const structure = await readDoc(dir, '.codemap/structure.md');
    expect(structure).toContain('# src/web/app.ts');
  });

  it('force=true always performs a full generation', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    await generateBoth(dir);
    const report = await runUpdateMaps(cfg(dir), true);
    expect(report.counts.mode).toBe('full');
  });

  it('US3-AS4: two concurrent updates are serialized and outputs remain valid', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    await generateBoth(dir);
    await fs.writeFile(path.join(dir, 'extra.md'), '# extra');

    // Same server-level mutex wrapping as src/server.ts.
    const mutex = new AsyncMutex();
    const [first, second] = await Promise.all([
      mutex.runExclusive(() => runUpdateMaps(cfg(dir), false)),
      mutex.runExclusive(() => runUpdateMaps(cfg(dir), false)),
    ]);
    expect(['success', 'partial']).toContain(first.result.status);
    expect(['success', 'partial']).toContain(second.result.status);
    expect(second.queuedMs).toBeGreaterThan(0);

    // Outputs uncorrupted: parseable markdown with fresh state.
    const structure = await readDoc(dir, '.codemap/structure.md');
    expect(structure).toContain('# extra.md');
    const meta = JSON.parse(await readDoc(dir, '.codemap/meta.json'));
    expect(meta.version).toBe(1);
  });

  it('no-op update reports zero added/changed/removed', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    await generateBoth(dir);
    const report = await runUpdateMaps(cfg(dir), false);
    expect(report.counts).toMatchObject({ added: 0, changed: 0, removed: 0, mode: 'incremental' });
  });
});
