# Tasks: Workspace Mapping Tools (MCP Server)

**Input**: Design documents from `/specs/001-workspace-map-mcp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, contracts/map-formats.md, quickstart.md

**Tests**: Included — plan.md commits to a Vitest test strategy (contract/unit/integration/perf tiers, R11) and the Constitution Check cites those tests as gate evidence. Tests follow implementation within each story (TDD was not requested).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Single project (per plan.md): `src/`, `tests/` at repository root. Generated artifacts land in the *target* workspace's `.codemap/` at runtime — never in this repo's source tree.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, tooling, and shared test fixtures

- [ ] T001 Initialize npm package: create package.json (name `workspace-map-mcp`, type module, bin entry `workspace-map-mcp` → dist/index.js), tsconfig.json (ES2022, NodeNext, strict), and .gitignore (node_modules, dist) at repository root
- [ ] T002 Install dependencies: `@modelcontextprotocol/sdk`, `web-tree-sitter`, `ignore`, `zod` (runtime); `typescript`, `vitest`, `@types/node`, `eslint`, `prettier`, `tsx` (dev) — record exact versions in package.json
- [ ] T003 [P] Configure Vitest in vitest.config.ts and create test folder skeleton: tests/contract/, tests/integration/, tests/unit/, tests/fixtures/
- [ ] T004 [P] Configure linting/formatting: eslint.config.js (typescript-eslint, no-floating-promises) and .prettierrc at repository root; add npm scripts `build`, `test`, `lint` to package.json
- [ ] T005 [P] Add grammar acquisition script scripts/fetch-grammars.mjs that downloads/copies tree-sitter WASM grammars (c-sharp, typescript+tsx, javascript, python, java, go, rust) into assets/grammars/, wired to package.json `prepare` script; commit resulting .wasm files so installs are offline (R3, R12)
- [ ] T006 [P] Create static test fixture workspaces under tests/fixtures/: `multi-lang/` (C#, TS, Python, Java, Go, Rust files with inheritance, interfaces, cross-file imports, method calls), `symlink-cycle/` (script scripts/make-symlink-fixture.mjs creating junction loop at test setup), `name-collision/` (two `OrderService` classes in different namespaces), `docs-only/` (markdown files only), `unparseable/` (file with syntax errors + binary file + .ps1 fallback-tier file), each with a .gitignore excluding one folder

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required by ALL user stories — server skeleton, CLI, traversal, ignore rules, atomicity, serialization, metadata sidecar

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 [P] Define shared model types in src/types.ts: `ScanConfiguration`, `TreeEntry`, `TypeEntry`, `TypeRelation`, `FileDependency`, `CallReference`, `FileRecord`, `MapMetadata`, `ToolResultReport` exactly per data-model.md field tables
- [ ] T008 [P] Implement atomic write helper in src/core/atomicWrite.ts: write to `<name>.tmp` in same directory then `fs.rename`; export `atomicWriteFile(absPath, content)` (FR-014, R7)
- [ ] T009 [P] Implement async mutex in src/core/mutex.ts: promise-queue serialization with queued-wait duration reporting for ToolResultReport warnings (FR-014, R8 concurrency)
- [ ] T010 Implement ignore rule layering in src/core/ignoreRules.ts: built-in defaults (`.git`, `node_modules`, `bin`, `obj`, `dist`, `build`, `out`, `.vs`, `.idea`, `__pycache__`, `.venv`, `venv`, `target`, `packages`, `.codemap`), nested .gitignore support via `ignore` package, user include/exclude globs; built-ins non-overridable; expose applied-rules summary for document headers (FR-002, R5)
- [ ] T011 Implement workspace walker in src/core/walker.ts: iterative BFS using ignoreRules, `fs.realpath` visited-set symlink-cycle guard with `→ symlink` marker entries, deterministic ordering (folders before files, case-insensitive alphabetical), returns `TreeEntry` root + folder/file counts (FR-001, R6)
- [ ] T012 Implement metadata sidecar in src/meta/metadata.ts: read/validate/write `.codemap/meta.json` (version, generatedAt, workspaceRoot, config snapshot, FileRecord[] with size/mtimeMs/contentHash/language/typeIds), content hashing helper, corrupt/version-mismatch/config-drift detection returning `full-generation-required` (data-model §4, R8)
- [ ] T013 Implement MCP server wiring in src/server.ts: create McpServer instance, tool registration helper that wraps every handler in the mutex and a uniform `ToolResultReport` envelope (status/filesWritten/counts/durationMs/warnings/errors), zod schema enforcement, never-partial-output-on-error rule (FR-012, contracts/mcp-tools.md cross-cutting rules)
- [ ] T014 Implement CLI entry in src/index.ts: parse `--workspace <abs-path>` (required) and `--max-doc-lines <n>` (default 1500), validate root exists/is-directory/readable with actionable stderr message + non-zero exit, connect stdio transport, register all tools from src/server.ts (contracts server-launch contract)
- [ ] T015 [P] Unit tests for walker + ignore layering in tests/unit/walker.test.ts and tests/unit/ignoreRules.test.ts: default exclusions, .gitignore honored, user patterns, built-ins non-overridable, symlink cycle terminates with single marker entry, deterministic ordering (uses fixtures from T006)
- [ ] T016 [P] Unit tests for atomicWrite + mutex + metadata in tests/unit/atomicWrite.test.ts, tests/unit/mutex.test.ts, tests/unit/metadata.test.ts: rename atomicity (no partial file on simulated failure), serialized execution order + queued-duration report, meta.json round-trip and corruption/version-mismatch fallback signals

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Generate Workspace Structure Map (Priority: P1) 🎯 MVP

**Goal**: `scan_structure` tool walks the workspace and writes `.codemap/structure.md` (+ partitions) — a markdown folder/file tree from which any AI can read every relative path

**Independent Test**: Connect an MCP client (or test harness), invoke `scan_structure` on a fixture workspace, verify the markdown lists every non-excluded folder/file with correct relative paths, metadata header, and exclusion list (US1 acceptance scenarios 1–4)

### Implementation for User Story 1

- [ ] T017 [P] [US1] Implement structure renderer in src/render/structureMarkdown.ts: metadata header (timestamp, workspace name, format version, counts table, exclusions section), tree block with `# relative/path` comment per file line, symlink markers, `/` separators — exactly per contracts/map-formats.md structure.md format (FR-001, FR-008)
- [ ] T018 [P] [US1] Implement partitioning in src/render/partition.ts: when rendered doc exceeds `maxDocLines`, split per top-level folder into `structure/<folder>.md` (each with full header), root doc becomes index with partition table + top-level-only tree; generic enough for reuse by relations renderer (FR-015, R7)
- [ ] T019 [US1] Implement scan_structure handler in src/tools/scanStructure.ts: compose walker → renderer → partition → atomicWrite into `.codemap/`, write FileRecords (path/size/mtime/hash, language null) via src/meta/metadata.ts, return ToolResultReport with folders/files/partitions counts; unreadable root → status error, filesWritten [] (US1-AS4)
- [ ] T020 [US1] Register `scan_structure` in src/server.ts with zod input schema `{ includePatterns?: string[], excludePatterns?: string[] }` (additionalProperties false) per contracts/mcp-tools.md Tool 1
- [ ] T021 [P] [US1] Contract test in tests/contract/scanStructure.test.ts: input schema rejects unknown properties, output report matches Tool 1 shape (tool/status/filesWritten/counts/durationMs/warnings/errors), deterministic array ordering
- [ ] T022 [P] [US1] Integration tests in tests/integration/scanStructure.test.ts: multi-lang fixture → every non-excluded file present with correct relative path; .gitignore + default exclusions applied and listed in header; symlink-cycle fixture → terminates, single symlink marker; re-run → regenerated timestamp changes (US1-AS1/2/3)
- [ ] T023 [US1] Integration test for error path + partitioning in tests/integration/scanStructureEdges.test.ts: nonexistent/unreadable root → error report, no partial `.codemap/` output; fixture exceeding maxDocLines (set threshold low, e.g., 20) → index doc + per-folder partitions with correct links (US1-AS4, FR-015)

**Checkpoint**: `scan_structure` fully functional over MCP — MVP deliverable

---

## Phase 4: User Story 2 - Generate Code Relation Map (Priority: P2)

**Goal**: `scan_relations` tool auto-detects languages and writes `.codemap/relations.md` (+ partitions): type→file index, inheritance/interfaces, import dependencies, best-effort method calls, reduced-analysis reporting

**Independent Test**: Invoke `scan_relations` on the multi-lang fixture; verify each type maps to its defining file with inheritance/implements listed, imports recorded, collisions disambiguated, unparseable files reported without aborting (US2 acceptance scenarios 1–5)

### Implementation for User Story 2

- [ ] T024 [P] [US2] Implement language detection in src/relations/detect.ts: extension map for deep-tier languages (cs, ts/tsx/js/jsx, py, java, go, rs), shebang sniffing for extensionless scripts, tier classification (deep/fallback/none) + per-language file counts summary (FR-003, R4)
- [ ] T025 [US2] Implement parser registry in src/relations/parserRegistry.ts: lazy web-tree-sitter init, load WASM grammar from assets/grammars/ on first use per language, cache parsers, parse-error tolerance returning partial trees (R3)
- [ ] T026 [P] [US2] Implement C# extractor in src/relations/extractors/csharp.ts: classes/interfaces/structs/enums with namespace qualifier, base-list inheritance/implements, `using` directives, invocation expressions (syntactic calls) → TypeEntry/TypeRelation/FileDependency/CallReference per data-model.md
- [ ] T027 [P] [US2] Implement TypeScript/JavaScript extractor in src/relations/extractors/typescript.ts: classes/interfaces/type aliases with module-path qualifier, extends/implements, import/require specifiers with relative-path resolution to workspace files, call expressions; covers .ts/.tsx/.js/.jsx
- [ ] T028 [P] [US2] Implement Python extractor in src/relations/extractors/python.ts: classes with module qualifier, base classes, import/from-import with module→file resolution, call expressions
- [ ] T029 [P] [US2] Implement Java extractor in src/relations/extractors/java.ts: classes/interfaces/enums with package qualifier, extends/implements, imports, method invocations
- [ ] T030 [P] [US2] Implement Go extractor in src/relations/extractors/go.ts: structs/interfaces with package qualifier, interface embedding, imports, call expressions
- [ ] T031 [P] [US2] Implement Rust extractor in src/relations/extractors/rust.ts: structs/enums/traits with module-path qualifier, trait impls as implements-relations, use declarations, call expressions
- [ ] T032 [P] [US2] Implement regex fallback importer in src/relations/fallbackImports.ts: file-level import/include/using patterns for non-deep-tier text files, flag file as reduced-analysis with reason (FR-011)
- [ ] T033 [US2] Implement relations renderer in src/render/relationsMarkdown.ts: metadata header, language-coverage table with tiers, whole type index table, collision-group disambiguation note, per-type sections (inherits/implements with resolved `targetId` or `(external)`, calls labeled *syntactic, best-effort*), file-dependencies table, reduced-analysis section, docs-only "No analyzable source code found" case — per contracts/map-formats.md relations.md format; reuse src/render/partition.ts keeping type index whole in root doc (FR-004, FR-011, FR-013)
- [ ] T034 [US2] Implement scan_relations handler in src/tools/scanRelations.ts: walker file list → detect → parse/extract per language (fallback tier via fallbackImports) → cross-file relation resolution (targetId lookup, import path resolution) → renderer → atomicWrite; update FileRecords in meta.json with language + typeIds; ToolResultReport with types/relations/fileDependencies/reducedAnalysisFiles/partitions counts, status `partial` + warning when any file reduced (US2-AS4)
- [ ] T035 [US2] Register `scan_relations` in src/server.ts with zod schema `{ includePatterns?, excludePatterns?, includeCalls? (default true) }` per contracts/mcp-tools.md Tool 2
- [ ] T036 [P] [US2] Contract test in tests/contract/scanRelations.test.ts: schema validation incl. includeCalls default, Tool 2 report shape, partial-status semantics
- [ ] T037 [US2] Integration tests in tests/integration/scanRelations.test.ts: multi-lang fixture → each known type mapped to correct defining file with inheritance/implements (US2-AS1) and imports recorded incl. external `(external)` rendering (US2-AS2); calls recorded for known caller/callee pair (US2-AS3); unparseable fixture → scan completes partial with reduced-analysis listing (US2-AS4, FR-011); name-collision fixture → both `OrderService` entries qualified and disambiguated (US2-AS5, FR-013); docs-only fixture → success with explanatory note

**Checkpoint**: Both maps generatable independently — US1 + US2 functional

---

## Phase 5: User Story 3 - Update Maps On Demand (Priority: P3)

**Goal**: `update_maps` tool refreshes both documents incrementally from meta.json diffing (full generation fallback), leaving zero stale entries — no watchers

**Independent Test**: Generate maps, then add/rename/delete files in a temp copy of a fixture, invoke `update_maps`, verify both docs match the new state exactly; delete meta.json and verify full-generation fallback (US3 acceptance scenarios 1–4)

### Implementation for User Story 3

- [ ] T038 [US3] Implement diff classification in src/meta/metadata.ts (extend): compare fresh walk against stored FileRecords using size/mtime pre-filter + contentHash confirmation → `{ added[], changed[], removed[] }`; expose stale typeIds from removed/changed records for model eviction (R8, US3-AS2)
- [ ] T039 [US3] Implement update_maps handler in src/tools/updateMaps.ts: `force` flag or missing/corrupt meta.json or missing map files → run full scan_structure + scan_relations pipelines; otherwise re-walk, diff (T038), re-parse only added/changed files, evict stale entries, re-render affected documents + always-fresh structure tree, atomicWrite all outputs + updated meta.json; ToolResultReport counts `{ added, changed, removed, mode: incremental|full }` (FR-005)
- [ ] T040 [US3] Register `update_maps` in src/server.ts with zod schema `{ force? (default false) }` per contracts/mcp-tools.md Tool 3; ensure queued-behind-mutex second call completes with "queued for <n> ms" warning
- [ ] T041 [P] [US3] Contract test in tests/contract/updateMaps.test.ts: schema (force default false), Tool 3 report shape incl. mode field
- [ ] T042 [US3] Integration tests in tests/integration/updateMaps.test.ts: add file → appears in both maps (US3-AS1); rename + delete → zero references to old paths in either doc, stale types evicted (US3-AS2); no meta.json → mode full (US3-AS3); force=true → mode full; two concurrent invocations → serialized, both succeed, second reports queued warning, outputs uncorrupted (US3-AS4); update of ≤100 changed files touches only affected partitions

**Checkpoint**: Maps stay trustworthy on demand — US1+US2+US3 functional

---

## Phase 6: User Story 4 - Agent Skill and Copilot Instructions Guidance (Priority: P4)

**Goal**: `install_guidance` tool installs `.github/skills/workspace-map/SKILL.md` and a marker-managed section in `.github/copilot-instructions.md` teaching AI assistants to consume the maps and refresh them when stale

**Independent Test**: Run `install_guidance` against a workspace with pre-existing copilot-instructions.md; verify managed block added, user content byte-identical, re-run replaces block without duplication, missing file gets created (US4 acceptance scenarios 1–4)

### Implementation for User Story 4

- [ ] T043 [P] [US4] Author skill template in src/guidance/skillTemplate.ts: SKILL.md content (name, description, when-to-use) instructing agents to read `.codemap/structure.md` for path resolution, `.codemap/relations.md` for type navigation, check generation timestamps for staleness, and call `update_maps` on the `workspace-map-mcp` server when stale (FR-009)
- [ ] T044 [P] [US4] Implement managed-section merge in src/guidance/copilotInstructions.ts: locate `<!-- BEGIN workspace-map-mcp -->` / `<!-- END workspace-map-mcp -->` markers — replace block in place if one pair exists, append block if none, create file (with block) if absent; preserve all outside content byte-for-byte; >1 marker pair → error with remediation message, file untouched (FR-010, US4-AS1/2/4, data-model §6)
- [ ] T045 [US4] Implement install_guidance handler in src/tools/installGuidance.ts: write SKILL.md (wholesale overwrite) + merge copilot-instructions section via atomicWrite, honor `copilotInstructionsPath` input default `.github/copilot-instructions.md`, ToolResultReport with `sectionAction: created-file|appended|replaced`
- [ ] T046 [US4] Register `install_guidance` in src/server.ts with zod schema `{ copilotInstructionsPath? }` per contracts/mcp-tools.md Tool 4
- [ ] T047 [P] [US4] Contract test in tests/contract/installGuidance.test.ts: schema default path, Tool 4 report shape incl. sectionAction values
- [ ] T048 [US4] Integration tests in tests/integration/installGuidance.test.ts: existing instructions file → block appended, outside content byte-identical (US4-AS1); no file → created with block (US4-AS2); re-run → exactly one block, replaced in place (US4-AS4); duplicate marker pairs → error status, file untouched; SKILL.md content references correct map paths and update_maps tool (US4-AS3 content check)

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Performance validation, end-to-end verification, distribution readiness

- [ ] T049 [P] Create perf fixture generator in scripts/generate-perf-fixture.mjs: synthesizes a 10,000-file multi-language workspace under tests/fixtures/perf-10k/ (gitignored, generated on demand)
- [ ] T050 Performance smoke test in tests/integration/performance.test.ts: full scan of perf-10k fixture < 60 s (SC-003); mutate 100 files → update_maps < 15 s with zero stale entries (SC-004); marked long-running/opt-in via env flag
- [ ] T051 [P] Write README.md at repository root: features, quickstart-aligned client registration (VS Code .vscode/mcp.json + Claude Desktop examples from quickstart.md), tool reference table, troubleshooting; verify SC-005 five-minute path
- [ ] T052 End-to-end test in tests/integration/e2e.test.ts: spawn built server via stdio with MCP client SDK, assert all four tools listed with correct schemas, run scan_structure → scan_relations → install_guidance → mutate → update_maps full flow against a temp fixture copy, validate every quickstart §5 acceptance-smoke row
- [ ] T053 Final gate: `npm run lint`, `npm run build`, full `npm test` green; `npm pack` and verify packaged tarball includes dist/ + assets/grammars/ and `npx` launch works from the tarball (R12, SC-005)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2 (walker, ignore, metadata, server) — independent of US1 at runtime; shares only src/render/partition.ts (T018) with US1, so implementing US2 standalone requires pulling T018 forward
- **Phase 5 (US3)**: Depends on US1 + US2 handlers (it re-runs their pipelines) — inherently integrative
- **Phase 6 (US4)**: Depends on Phase 2 only (server registration); content references US1–US3 tool names but no code dependency — can be built in parallel with US2/US3
- **Phase 7 (Polish)**: Depends on all user stories

### User story dependency graph

```text
Phase 1 → Phase 2 ─┬─→ US1 (P1) ─┬─→ US3 (P3) ─→ Phase 7
                   ├─→ US2 (P2) ─┘
                   └─→ US4 (P4) ────────────────→ Phase 7
       (US2 borrows T018 partition.ts from US1's file set)
```

### Within each story

- Renderers/extractors ([P] tasks, different files) → tool handler → server registration → contract test [P] → integration tests

## Parallel Execution Examples

### Phase 2 kickoff (after T007)

```text
Parallel: T008 (atomicWrite.ts) | T009 (mutex.ts) | T010 (ignoreRules.ts)
Then:     T011 (walker.ts, needs T010) → T012–T014 → Parallel: T015 | T016
```

### US2 extractor fan-out (after T025)

```text
Parallel: T026 (csharp) | T027 (typescript) | T028 (python) | T029 (java) | T030 (go) | T031 (rust) | T032 (fallback)
Then:     T033 (renderer) → T034 (handler) → T035 (register) → Parallel: T036 | T037
```

### Cross-story parallelism (two developers, after Phase 2)

```text
Dev A: Phase 3 (US1) then Phase 5 (US3)
Dev B: Phase 6 (US4) then Phase 4 (US2, pull T018 if US1 unfinished)
```

## Implementation Strategy

**MVP first (US1 only)**: Complete Phase 1 → Phase 2 → Phase 3, then validate `scan_structure` end-to-end via an MCP client. This alone delivers the core promise — AI assistants resolve any relative path from one document.

**Incremental delivery**:

1. Phases 1–3 → MVP: structure map over MCP
2. Phase 4 → relation map (type navigation)
3. Phase 5 → trustworthy on-demand refresh
4. Phase 6 → agents actually adopt the maps (skill + copilot-instructions)
5. Phase 7 → perf proof (SC-003/004), docs (SC-005), packaging

Each checkpoint is independently testable per the story's Independent Test criteria; stop at any checkpoint with a working increment.

## Summary

| Phase | Tasks | Count |
|---|---|---|
| 1 Setup | T001–T006 | 6 |
| 2 Foundational | T007–T016 | 10 |
| 3 US1 structure map (P1, MVP) | T017–T023 | 7 |
| 4 US2 relation map (P2) | T024–T037 | 14 |
| 5 US3 update on demand (P3) | T038–T042 | 5 |
| 6 US4 skill + guidance (P4) | T043–T048 | 6 |
| 7 Polish | T049–T053 | 5 |
| **Total** | | **53** |

Parallel opportunities: 24 tasks marked [P], biggest fan-out is the 7-way US2 extractor batch; US4 can proceed fully parallel to US2/US3 after Phase 2.
