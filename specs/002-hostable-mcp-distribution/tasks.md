# Tasks: Hostable MCP Server Distribution & Multi-Project Connection

**Input**: Design documents from `/specs/002-hostable-mcp-distribution/`
**Prerequisites**: plan.md, spec.md (+Clarifications), research.md, data-model.md, contracts/cli.md, contracts/packaging.md, quickstart.md

**Tests**: Included — plan.md commits to Vitest suites (HTTP e2e, init integration, pack smoke, Docker smoke) and SC-006 makes the unchanged feature-001 suite a hard regression gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Single npm package (per plan.md): `src/`, `tests/`, `docs/`, repo-root `Dockerfile` and `.github/workflows/`. Feature-001 code is modified only where plan.md marks MODIFIED.

---

## Phase 1: Setup (Baseline)

**Purpose**: Freeze a green baseline so every later phase can prove zero regressions (SC-006)

- [X] T001 Verify baseline on branch `002-hostable-mcp-distribution`: run `npm ci`, `npm run lint`, `npm run build`, `npm test` — all green; record Node/npm versions and test counts in the task note; this state is the SC-006 reference
  > Note (2026-07-08): Node v20.17.0, npm 11.0.0; lint+build clean; 67 passed | 2 skipped (perf fixture absent), 16 test files.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: CLI restructuring every story routes through — arg parsing, subcommand router, stdio extraction, `--version`

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Create src/cli/args.ts: move workspace/max-doc-lines validation out of src/index.ts unchanged (same error texts, FR-006/FR-008), add `--http` (boolean), `--port` (int 1–65535, required with --http), `--host` (default `127.0.0.1`), `--version`/`-v` definitions via `node:util parseArgs`; export a validated `TransportConfiguration` per data-model.md §1
- [X] T003 [P] Create src/transport/stdio.ts: extract the current StdioServerTransport connect + ready log from src/index.ts into `startStdio(server, config)` with byte-identical behavior
- [X] T004 Rewrite src/index.ts as a thin router on `process.argv[2]`: no subcommand → serve (args.ts → createServer → stdio transport; HTTP branch stubbed until US2), `init` → stub exiting 1 with "not yet implemented", `--version`/`-v` → print version read from package.json and exit 0 (FR-015); legacy invocation `--workspace <p> [--max-doc-lines n]` MUST behave byte-identically to v0.1.0 (contracts/cli.md backward-compat guarantee)
- [X] T005 [P] Contract test in tests/contract/cliArgs.test.ts: full flag table from contracts/cli.md — workspace required/absolute/exists errors unchanged, port range validation, "--port is required with --http", host defaults to 127.0.0.1, --version short-circuits before workspace validation
- [X] T006 Regression checkpoint: run full suite — feature-001 unit/contract/integration/e2e tests pass with zero modifications to their files (FR-006, SC-006)
  > Note (2026-07-08): 79 passed | 2 skipped (17 files) — baseline 67 + 12 new cliArgs contract tests; no feature-001 test file modified.

**Checkpoint**: Router in place, stdio behavior provably unchanged — user story implementation can begin

---

## Phase 3: User Story 1 - Install From a Registry or Repository and Use Anywhere (Priority: P1) 🎯 MVP

**Goal**: `@anhnguyendaenet/workspace-map-mcp` installable via npm registry (prebuilt, no toolchain), GitHub (self-building), and global/local link — with grammar assets resolving from every install location

**Independent Test**: `npm pack` → install tarball into an empty temp dir → `workspace-map-mcp --version` + full scan flow against a sample project; separately `npm install -g` from the local clone path and re-verify (US1 acceptance scenarios 1–4)

### Implementation for User Story 1

- [X] T007 [P] [US1] Update package.json identity: name `@anhnguyendaenet/workspace-map-mcp`, version `0.2.0`, `publishConfig.access: "public"`, `repository`/`bugs`/`homepage` pointing to github.com/AnhNguyenDaenet/WorkplaceWorkTree, `keywords`, files `["dist","assets/grammars","README.md"]`; bin stays `workspace-map-mcp` (research R1)
- [X] T008 [P] [US1] Create scripts/build-if-needed.mjs: skip compile when dist/index.js exists and is newer than the newest src/**/*.ts; otherwise run `tsc -p tsconfig.json`; exit 0 with a warning (never fail) when tsc is unavailable but a usable dist/ exists (research R2)
- [X] T009 [US1] Wire lifecycle scripts in package.json: `prepublishOnly: "node scripts/fetch-grammars.mjs && tsc -p tsconfig.json"`, `prepare: "node scripts/fetch-grammars.mjs --soft && node scripts/build-if-needed.mjs"`; assert no `postinstall` exists (contracts/packaging.md lifecycle table, FR-001/FR-002)
- [X] T010 [P] [US1] Create src/core/assets.ts: resolve assets/grammars/ via `new URL('../../assets/grammars/', import.meta.url)` from the compiled file, existence check with actionable error naming the expected directory, fallback probe one level up for tsx/source execution (FR-004, research R6)
- [X] T011 [US1] Switch src/relations/parserRegistry.ts to the src/core/assets.ts resolver (remove its inline grammarsDir helper)
- [X] T012 [US1] Pack-smoke + git-install test in tests/integration/packSmoke.test.ts: (a) tarball path — run `npm pack` programmatically → `npm install <tarball>` into a temp dir → verify no build ran on install (dist/ mtime unchanged) → execute installed bin `--version` → serve a copied fixture workspace via stdio client → `scan_structure` succeeds and grammars load (validates FR-001 + FR-004); (b) git path — `npm install git+file://<repo-root>` into a second temp dir (exercises the guarded `prepare` self-build exactly like a GitHub install, no network) → installed bin `--version` works and dist/ + grammars exist in the installed package (validates FR-002; together with (a) covers SC-002's registry+GitHub channels)
- [X] T013 [P] [US1] Create CI workflow .github/workflows/ci.yml: triggers push/PR on `main` and `[0-9][0-9][0-9]-*`; steps checkout → setup-node 20 with npm cache → `npm ci` → `npm run lint` → `npm run build` → `npm test` → `npm pack` → upload tarball artifact (FR-011 validation half, contracts/packaging.md)
- [X] T014 [US1] Channel checkpoint: locally verify global install path — `npm link` (or `npm i -g .`) → `workspace-map-mcp --version` from an unrelated directory → scan a sample project → `npm unlink -g` cleanup; record evidence in task note (US1-AS3, FR-003)
  > Note (2026-07-08): `npm link` → `workspace-map-mcp --version`/`-v` printed 0.2.0 from %TEMP%; launch against a multi-lang fixture copy logged "v0.2.0 ready — workspace: …wmap-link-check"; `npm uninstall -g` verified (LINK_PRESENT=False).

**Checkpoint**: Package installs and runs from tarball, GitHub-style source, and global command — MVP deliverable

---

## Phase 4: User Story 2 - Connect via HTTP Transport (Priority: P2)

**Goal**: Opt-in `--http --port <n> [--host]` mode serving the same four tools over MCP Streamable HTTP at `/mcp`, localhost-bound by default, with stdio untouched as default

**Independent Test**: Start server with `--http --port <ephemeral>` against a fixture, connect with the SDK HTTP client, run the 4-tool flow, diff against stdio results modulo timestamps; verify no-flag launch is byte-identical to before (US2 acceptance scenarios 1–5)

### Implementation for User Story 2

- [X] T015 [P] [US2] Create src/transport/http.ts: `node:http` server routing POST/GET/DELETE `/mcp` into `StreamableHTTPServerTransport` in stateless mode (`sessionIdGenerator: undefined`, per-request McpServer via the existing createServer factory sharing the process-wide mutex), 404 for other paths, bind `config.host:config.port`, EADDRINUSE → actionable error + exit 1, SIGINT/SIGTERM → stop accepting, drain in-flight work, exit 0 (FR-005/FR-007/FR-009, research R3, US2-AS3/AS5)
- [X] T016 [US2] Wire the HTTP branch in src/index.ts serve path: `config.transport === 'http'` → src/transport/http.ts, else stdio; startup log line states transport, bind address, and workspace (FR-007 visibility)
- [X] T017 [US2] HTTP e2e test in tests/integration/httpTransport.test.ts: spawn built server with `--http --port <free-port>` against a fixture copy, connect via SDK `StreamableHTTPClientTransport`, assert all four tools listed, run scan_structure → scan_relations → install_guidance → update_maps, then run the same flow over stdio on an identical fixture copy and assert result parity ignoring timestamp/durationMs lines (US2-AS1, SC-003)
- [X] T018 [US2] HTTP edge tests in tests/integration/httpTransportEdges.test.ts: second instance on same port → clear error, non-zero exit (US2-AS3); two concurrent HTTP clients invoking tools → serialized, second report carries queued warning, outputs uncorrupted (US2-AS4, FR-009); launch without `--http` → stdio behavior regression-checked (US2-AS2); `--http` without `--port` → actionable error; graceful shutdown: start a long scan over HTTP, send SIGTERM mid-flight, assert the in-flight request completes or fails cleanly, process exits 0, and all maps in `.codemap/` are valid/complete — never half-written (US2-AS5, FR-009 atomicity under shutdown)

**Checkpoint**: Both transports live; stdio provably unchanged — US1 + US2 functional

---

## Phase 5: User Story 3 - Run as a Docker Container (Priority: P3)

**Goal**: GHCR-published image running stdio and HTTP modes against a bind-mounted workspace, maps written back to the host with workspace-relative paths only

**Independent Test**: Build the image locally, run stdio mode with a fixture mounted at /workspace, verify maps appear on the host with no `/workspace` strings; repeat in HTTP mode with a published port (US3 acceptance scenarios 1–3)

### Implementation for User Story 3

- [X] T019 [P] [US3] Create Dockerfile (node:20-slim, WORKDIR /app, copy package.json + prebuilt dist/ + assets/grammars/, `npm ci --omit=dev --ignore-scripts`, `USER node`, `ENTRYPOINT ["node","dist/index.js"]`) and .dockerignore (node_modules, tests, specs, .git, .codemap, docs, src) per contracts/packaging.md (FR-010, research R7)
- [X] T020 [P] [US3] Create release workflow .github/workflows/release.yml: trigger tag `v*`; permissions contents:read + packages:write; job 1 build (`npm ci && npm run build`) → docker/build-push-action → `ghcr.io/anhnguyendaenet/workspace-map-mcp:{version,latest}` via GITHUB_TOKEN; job 2 npm publish `--access public` skipped-not-failed when `NPM_TOKEN` secret absent; fail workflow when tag version ≠ package.json version (FR-011 publish half, research R8)
- [X] T021 [US3] Docker smoke test in tests/integration/dockerSmoke.test.ts guarded by `describe.runIf(dockerAvailable)`: build image from repo, run stdio flow with fixture bind-mounted at /workspace via MCP stdio client wrapping `docker run -i`, assert maps written to host fixture and `grep -L "/workspace"` across .codemap/*.md (US3-AS1/AS3); start HTTP-mode container with `-p` and run tool-list check (US3-AS2)
  > Note (2026-07-08): verified locally against a real daemon — stdio (maps on host, zero `/workspace` leaks) and HTTP (4 tools via published port) both green.

**Checkpoint**: Container channel verified locally; CI publishes on tag — US1+US2+US3 functional

---

## Phase 6: User Story 4 - One-Command Project Setup (Priority: P4)

**Goal**: `workspace-map-mcp init` writes/merges a `servers["workspace-map"]` entry into the target project's .vscode/mcp.json (idempotent, sibling-preserving) and optionally installs the feature-001 guidance

**Independent Test**: Run init in a fresh temp project (file created), in a project with existing servers (preserved byte-for-byte), re-run (single entry), against corrupt JSON (abort untouched), with --guidance (skill installed) — SC-005 matrix (US4 acceptance scenarios 1–3)

### Implementation for User Story 4

- [X] T022 [P] [US4] Implement entry generation + merge core in src/cli/init.ts: `buildServerEntry(transport, channel, port)` producing the four variants from data-model.md §4 (npx/global/docker stdio commands, http URL); `mergeMcpJson(existingText|null, entry)` — strict `JSON.parse`, abort with actionable message on failure (JSONC unsupported, named in error), own exactly `servers["workspace-map"]`, preserve all sibling keys/servers, return `{content, fileAction, entryAction}` per the state machine (FR-012)
- [X] T023 [US4] Implement the init command flow in src/cli/init.ts: flags `--target` (default cwd, must exist), `--transport stdio|http`, `--channel npx|global|docker`, `--port` (default 3579), `--guidance`, `--yes` per contracts/cli.md; interactive guidance confirm unless `--yes`; write via existing src/core/atomicWrite.ts; on `--guidance` invoke existing runInstallGuidance from src/tools/installGuidance.ts against target; print InitResult (data-model.md §5) with next steps; exit 0/1, never partial writes (FR-013)
- [X] T024 [US4] Replace the init stub in src/index.ts router with the real subcommand (T004 stub → src/cli/init.ts entry)
- [X] T025 [US4] Integration tests in tests/integration/initCommand.test.ts: fresh temp project → file created with working npx entry (US4-AS1); existing mcp.json with two other servers → entry added, siblings byte-identical (US4-AS2); re-run → entryAction updated, exactly one workspace-map entry; corrupt/JSONC file → exit 1, file untouched; `--guidance --yes` → SKILL.md + managed section present in target (US4-AS3); `--transport http --port 4000` → URL entry variant; generated config parses as valid JSON (SC-005)

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation restructure (part of definition of done per clarification), final gates

- [X] T026 [P] Write docs/how-it-works.md: what the maps are, document formats, reading order for agents, architecture sketch (tools → core → render), staleness/update model
- [X] T027 [P] Write docs/install.md: all four channels (npx registry, GitHub install, global/local link, Docker pull) with copy-paste commands and `--version` verification per channel (US1-AS3 documented command)
- [X] T028 [P] Write docs/transports.md: stdio and HTTP recipes with full mcp.json snippets for VS Code and Claude Desktop, `--host` opt-in security note (localhost default, no auth v1, trusted networks only)
- [X] T029 [P] Write docs/docker.md: stdio + HTTP run recipes, bind-mount rules, GHCR tags, container `--host 0.0.0.0` + `-p` exposure explanation
- [X] T030 [P] Write docs/init-command.md: flag reference from contracts/cli.md, merge behavior + state table, examples per channel/transport, JSONC limitation note
- [X] T031 [P] Write docs/troubleshooting.md: absorb and expand the current README troubleshooting section (workspace errors, slow scans, fallback tiers, stale maps, duplicate markers, port conflicts, grammar-resolution errors)
- [X] T032 Rewrite README.md as a concise quickstart (≤ ~80 lines): what it is, npx + minimal mcp.json fastest path, tool table, `init` one-liner, link index into all six docs/ pages; every snippet uses `@anhnguyendaenet/workspace-map-mcp` (FR-014a, depends on T026–T031)
- [X] T033 Final gate: `npm run lint`, `npm run build`, full `npm test` (incl. pack smoke; docker smoke where available) green; feature-001 suite untouched and passing (SC-006); `npm pack --dry-run` contents match contracts/packaging.md files list; walk quickstart.md §4 verification table and check every row
  > Note (2026-07-08): lint+build clean; 22 files, 107 passed | 4 skipped (perf ×2, SIGTERM-drain win32-gated, docker-unavailable placeholder) — incl. pack smoke, git-install smoke, and live Docker smoke. Tarball: 45 files (dist/**, 8 grammars, README.md, package.json; no src/tests/docs). README = 61 lines. quickstart §4: version parity 0.2.0 across tarball/git/global/Docker ✓, HTTP↔stdio parity ✓, port-conflict error ✓, Docker host-write + zero `/workspace` leaks ✓, init idempotency ✓, feature-001 files unmodified (git audit) ✓; SC-004 timing row = reviewer walk-through post-publish.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Baseline)**: none — run immediately
- **Phase 2 (Foundational)**: after Phase 1 — BLOCKS all user stories (router/args/stdio extraction)
- **Phase 3 (US1)**: after Phase 2
- **Phase 4 (US2)**: after Phase 2 — independent of US1 (transport code vs packaging); shares only args.ts already built in Phase 2
- **Phase 5 (US3)**: after US1 (image copies the prebuilt dist/ + grammars contract from T007–T011) and benefits from US2 for the HTTP container test row; T019/T020 can start once US1 packaging lands
- **Phase 6 (US4)**: after Phase 2 (router) — independent of US1/US2/US3 at code level (reuses feature-001 guidance + atomicWrite); its docker/http entry *variants* are string templates, no runtime dependency
- **Phase 7 (Polish/docs)**: after all user stories (docs must describe implemented behavior)

### User story dependency graph

```text
Phase 1 → Phase 2 ─┬─→ US1 (P1) ──→ US3 (P3) ─┐
                   ├─→ US2 (P2) ───────────────┼─→ Phase 7 (docs + final gate)
                   └─→ US4 (P4) ───────────────┘
        (US3's HTTP container test row also exercises US2's flag)
```

### Within each story

- [P]-marked files first (parallel) → wiring in index.ts/package.json → tests → checkpoint

## Parallel Execution Examples

### Phase 2 kickoff

```text
T002 (args.ts) → then parallel: T003 (stdio.ts) | T005 (cliArgs.test.ts)
Then: T004 (router) → T006 (regression checkpoint)
```

### US1 fan-out (after Phase 2)

```text
Parallel: T007 (package.json) | T008 (build-if-needed.mjs) | T010 (assets.ts) | T013 (ci.yml)
Then:     T009 (lifecycle wiring) → T011 (parserRegistry switch) → T012 (pack smoke) → T014 (global checkpoint)
```

### Cross-story parallelism (two developers, after Phase 2)

```text
Dev A: US1 → US3
Dev B: US2 → US4
```

### Docs fan-out (Phase 7)

```text
Parallel: T026 | T027 | T028 | T029 | T030 | T031  →  T032 (README) → T033 (final gate)
```

## Implementation Strategy

**MVP first (US1 only)**: Phase 1 → Phase 2 → Phase 3 delivers the headline value — any project can `npx`/install the server without cloning this repo. Stop-and-ship point.

**Incremental delivery**:

1. Phases 1–3 → MVP: installable everywhere (registry-ready, GitHub-ready, global)
2. Phase 4 → HTTP transport for long-running/remote-client setups
3. Phase 5 → Docker image + tag-triggered GHCR publishing
4. Phase 6 → one-command onboarding (`init`)
5. Phase 7 → docs restructure (definition of done) + final gates

## Summary

| Phase | Tasks | Count |
|---|---|---|
| 1 Baseline | T001 | 1 |
| 2 Foundational | T002–T006 | 5 |
| 3 US1 install anywhere (P1, MVP) | T007–T014 | 8 |
| 4 US2 HTTP transport (P2) | T015–T018 | 4 |
| 5 US3 Docker (P3) | T019–T021 | 3 |
| 6 US4 init command (P4) | T022–T025 | 4 |
| 7 Polish/docs | T026–T033 | 8 |
| **Total** | | **33** |

Parallel opportunities: 15 tasks marked [P]; biggest fan-outs are US1's 4-way packaging batch and Phase 7's 6-way docs batch; US2 and US4 can proceed fully parallel to US1 after Phase 2.
