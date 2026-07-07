import { afterAll, describe, expect, it } from 'vitest';
import { runScanRelations } from '../../src/tools/scanRelations.js';
import { cfg, copyFixture, readDoc, rmrf } from '../helpers.js';

const tmpDirs: string[] = [];
afterAll(async () => {
  for (const dir of tmpDirs) await rmrf(dir);
});

describe('scan_relations integration (US2)', () => {
  it('US2-AS1/AS2/AS3: maps types to files with inheritance, imports, and calls', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    const report = await runScanRelations(cfg(dir), true);
    expect(['success', 'partial']).toContain(report.status);
    expect(Number(report.counts.types)).toBeGreaterThanOrEqual(10);

    const doc = await readDoc(dir, '.codemap/relations.md');

    // --- Type index maps each type to its defining file (US2-AS1) ---
    expect(doc).toContain('| `OrderService` | class | `Contoso.Orders` | src/csharp/OrderService.cs |');
    expect(doc).toContain('| `App` | class | `src/web/app` | src/web/app.ts |');
    expect(doc).toContain('| `Dog` | class | `src.py.zoo` | src/py/zoo.py |');
    expect(doc).toContain('| `Main` | class | `com.example` | src/java/com/example/Main.java |');
    expect(doc).toContain('| `Reader` | interface | `main` | src/go/types.go |');
    expect(doc).toContain('| `Circle` | struct |');

    // --- Inheritance / implements resolved to workspace files (US2-AS1) ---
    expect(doc).toContain('`ServiceBase` → `Contoso.Core.ServiceBase` (src/csharp/ServiceBase.cs)');
    expect(doc).toContain('`IOrderService` → `Contoso.Orders.IOrderService` (src/csharp/IOrderService.cs)');
    expect(doc).toContain('`Base` → `src/web/base.Base` (src/web/base.ts)');
    expect(doc).toContain('`Animal` → `src.py.models.Animal` (src/py/models.py)');
    // Rust trait implementation.
    expect(doc).toMatch(/`Circle`[\s\S]*?\*\*Implements\*\*: `Shape`/);

    // --- File dependencies: workspace-internal resolved, package imports external (US2-AS2) ---
    expect(doc).toContain('| src/csharp/OrderService.cs | src/csharp/ServiceBase.cs | `using Contoso.Core;` |');
    expect(doc).toContain('| src/web/app.ts | src/web/base.ts |');
    expect(doc).toContain('| src/py/zoo.py | src/py/models.py |');
    expect(doc).toMatch(/\| src\/java\/com\/example\/Main\.java \| \(external\) \| `import java\.util\.List;` \|/);
    expect(doc).toMatch(/\| src\/go\/main\.go \| \(external\) \|/);

    // --- Best-effort method calls (US2-AS3), labeled syntactic ---
    expect(doc).toContain('*(syntactic, best-effort)*');
    expect(doc).toContain('`Validator.Check`');
    expect(doc).toMatch(/`bark`/);

    // Language coverage table present with deep tiers.
    expect(doc).toContain('## Language coverage');
    expect(doc).toMatch(/\| csharp \| \d+ \| deep \|/);
  });

  it('US2-AS4 / FR-011: unparseable + fallback files reduce analysis without aborting', async () => {
    const dir = await copyFixture('unparseable');
    tmpDirs.push(dir);
    const report = await runScanRelations(cfg(dir), true);
    expect(report.status).toBe('partial');

    const doc = await readDoc(dir, '.codemap/relations.md');
    expect(doc).toContain('## Reduced analysis');
    expect(doc).toMatch(/broken\.cs — (syntax errors|parse failure)/);
    expect(doc).toContain('script.ps1 — fallback tier (imports only)');
    // Fallback import still captured.
    expect(doc).toContain('`Import-Module Foo`');
  });

  it('US2-AS5 / FR-013: identically named types are disambiguated by qualifier + path', async () => {
    const dir = await copyFixture('name-collision');
    tmpDirs.push(dir);
    await runScanRelations(cfg(dir), true);
    const doc = await readDoc(dir, '.codemap/relations.md');
    expect(doc).toContain('| `OrderService` | class | `Alpha` | alpha/OrderService.cs |');
    expect(doc).toContain('| `OrderService` | class | `Beta` | beta/OrderService.cs |');
    expect(doc).toContain('Name collisions are listed with full qualifiers');
  });

  it('docs-only workspace → success with explanatory note', async () => {
    const dir = await copyFixture('docs-only');
    tmpDirs.push(dir);
    const report = await runScanRelations(cfg(dir), true);
    expect(report.status).toBe('success');
    expect(report.counts.types).toBe(0);
    const doc = await readDoc(dir, '.codemap/relations.md');
    expect(doc).toContain('No analyzable source code found');
  });

  it('includeCalls=false omits call extraction', async () => {
    const dir = await copyFixture('multi-lang');
    tmpDirs.push(dir);
    await runScanRelations(cfg(dir), false);
    const doc = await readDoc(dir, '.codemap/relations.md');
    expect(doc).not.toContain('**Calls**');
  });
});
