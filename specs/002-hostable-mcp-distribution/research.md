# Research: Hostable MCP Server Distribution & Multi-Project Connection

**Feature**: 002-hostable-mcp-distribution | **Date**: 2026-07-07
**Purpose**: Record technology/approach decisions for the Technical Context in [plan.md](./plan.md). No NEEDS CLARIFICATION markers remained (two clarifications resolved in spec §Clarifications); this documents the implementation decisions.

## R1. Package identity & publish configuration

- **Decision**: Rename package to `@anhndh1997/workspace-map-mcp` (scope = owner's npm username; original `@anhnguyendaenet` scope did not exist on npm); keep `bin: { "workspace-map-mcp": "dist/index.js" }`; add `"publishConfig": { "access": "public" }` (scoped packages default to restricted); add `"repository"`, `"keywords"`, `"files"` including `docs/` excluded (docs live on GitHub, keep tarball lean: dist, assets/grammars, README).
- **Rationale**: Scoped name is guaranteed available (user decision B); public access flag is mandatory for free scoped publishing; bin name unchanged keeps every existing mcp.json/recipe working.
- **Alternatives considered**: unscoped `workspace-map-mcp` (availability risk, rejected by user); bundling docs/ in tarball (bloats an already 11 MB-unpacked package for content best read on GitHub).

## R2. Build-on-install strategy per channel (FR-001/FR-002)

- **Decision**: Two-layer approach:
  1. **Registry tarball ships prebuilt** — `prepublishOnly: npm run grammars && npm run build` guarantees `dist/` + grammars are in the published tarball; consumers never build (FR-001).
  2. **GitHub/git installs self-build** — `prepare: node scripts/fetch-grammars.mjs --soft && node scripts/build-if-needed.mjs`. npm runs `prepare` with devDependencies installed for git dependencies, so `tsc` and `tree-sitter-wasms` are available; `build-if-needed.mjs` skips compilation when `dist/index.js` already exists and sources haven't changed (fast local `npm install`), builds otherwise, and never fails the install when `dist/` is already usable.
- **Rationale**: `prepare` is the only lifecycle hook npm runs for git installs; guarding it keeps everyday `npm install` in the repo fast and non-fatal (mirrors the `--soft` grammar pattern already in place).
- **Alternatives considered**: committing `dist/` to git (merge noise, stale-build risk); `postinstall` build (runs for registry consumers too — violates no-toolchain requirement FR-001).

## R3. HTTP transport (FR-005/FR-007/FR-009)

- **Decision**: Use the MCP SDK's `StreamableHTTPServerTransport` in **stateless mode** (`sessionIdGenerator: undefined`) mounted on a plain `node:http` server at path `/mcp`; flags `--http`, `--port <n>` (required with --http), `--host <addr>` (default `127.0.0.1`, explicit opt-in for other interfaces per FR-007). A new `McpServer` instance is created per request (stateless pattern) but all tool handlers share the existing process-wide `AsyncMutex`, preserving serialized execution and atomic writes across concurrent clients (FR-009). Graceful shutdown on SIGINT/SIGTERM: stop accepting, let in-flight mutex queue drain, then exit.
- **Rationale**: Streamable HTTP is the current MCP standard transport (SSE deprecated); stateless mode avoids session bookkeeping — correct here because all state lives on disk in `.codemap/`, and the mutex already serializes writers; per-request server instances are the SDK-documented stateless pattern.
- **Alternatives considered**: stateful sessions with `mcp-session-id` (needless complexity, no per-client state exists); legacy SSE transport (deprecated); Express dependency (Node built-in `http` suffices for one POST/GET/DELETE route — zero new deps).

## R4. CLI surface & routing (FR-008/FR-012/FR-015)

- **Decision**: `dist/index.js` becomes a tiny router on `process.argv[2]`:
  - default (no subcommand) → serve: existing flags + `--http/--port/--host`; `--workspace` remains required (FR-008) with unchanged error text (FR-006 backward compat).
  - `init` → init subcommand (R5).
  - `--version` / `-v` → print version from package.json and exit 0 (FR-015).
  Parsing stays on `node:util parseArgs` (no commander/yargs dependency).
- **Rationale**: Backward compatibility is trivially provable — the no-subcommand path is byte-identical behavior; parseArgs already in use.
- **Alternatives considered**: commander (new dependency for 2 subcommands — YAGNI); separate `workspace-map-init` bin (pollutes PATH, splits docs).

## R5. `init` subcommand & mcp.json merge (FR-012/FR-013)

- **Decision**: `workspace-map-mcp init [--target <dir>] [--transport stdio|http] [--port <n>] [--channel npx|global|docker] [--guidance] [--yes]`. Behavior:
  - Reads `<target>/.vscode/mcp.json` if present; strict `JSON.parse` — on parse failure (including JSONC comments), abort with actionable message, file untouched (edge case).
  - Merges `servers["workspace-map"]` entry generated from transport/channel choice; all other keys preserved via object spread of the parsed document; re-run replaces only that entry (idempotent, US4-AS2/edge).
  - Writes via the existing `atomicWriteFile`.
  - `--guidance` (or interactive confirm) invokes the existing `runInstallGuidance` against the target.
  - Prints a structured result: file action, entry action (added/updated), guidance yes/no, next steps.
- **Rationale**: Strict-JSON-or-abort is the only safe merge policy without a JSONC parser dependency; reusing `runInstallGuidance` and `atomicWriteFile` keeps init a thin composition layer.
- **Alternatives considered**: JSONC parse via `jsonc-parser` dep (defer until users hit commented files); writing Claude Desktop config too (out of scope per spec assumption — docs cover it).

## R6. Grammar/asset resolution hardening (FR-004)

- **Decision**: New `src/core/assets.ts` resolving the grammars directory as `new URL('../../assets/grammars/', import.meta.url)` from the *compiled* file location (`dist/core/assets.js` → package root/assets/grammars), with an existence check and a fallback probe one level up (source-tree/tsx execution). `parserRegistry.ts` switches to it. Covered by the pack-smoke test which installs the real tarball into a temp dir and runs a scan.
- **Rationale**: `import.meta.url`-relative paths are immune to CWD, npx cache paths, global dirs, symlinked `npm link` folders, and container paths — the exact matrix FR-004 lists; the current code already uses this pattern, this formalizes + tests it.
- **Alternatives considered**: `require.resolve` on package name (self-resolution is brittle under link/npx); env-var override (unnecessary knob for v1).

## R7. Docker image (FR-010, US3)

- **Decision**: Single-stage `node:20-slim` Dockerfile consuming the **prebuilt** context (CI builds before `docker build`): copy `package.json`, `dist/`, `assets/grammars/`, `npm ci --omit=dev --ignore-scripts`, non-root `USER node`, `ENTRYPOINT ["node","dist/index.js"]` (args appended by `docker run`). Stdio mode: `docker run -i --rm -v <proj>:/workspace ghcr.io/anhnguyendaenet/workspace-map-mcp --workspace /workspace`. HTTP mode adds `--http --port 3579 --host 0.0.0.0 -p 3579:3579` — inside a container 0.0.0.0 binding is required and safe because exposure is controlled by `-p` (documented in docs/docker.md; FR-007 localhost default still holds for native runs).
- **Rationale**: Prebuilt copy keeps the image free of TypeScript/devDeps (small, fast, no build variance); `--ignore-scripts` avoids re-running prepare in-image; maps stay host-owned via bind mount, and workspace-relative paths guarantee no `/workspace` leakage (US3-AS3 — already true by design, asserted by test).
- **Alternatives considered**: multi-stage in-image build (slower CI, duplicate toolchain); alpine base (musl/WASM edge risks not worth ~40 MB).

## R8. CI/CD workflows (FR-011)

- **Decision**: Two GitHub Actions workflows:
  - `ci.yml` — on push/PR to main + feature branches: checkout → setup-node 20 → `npm ci` → lint → build → test → `npm pack` → upload tarball artifact; pack-smoke test runs in-suite.
  - `release.yml` — on tag `v*`: build once; `docker/build-push-action` to `ghcr.io/anhnguyendaenet/workspace-map-mcp:{version,latest}` using `GITHUB_TOKEN` (packages:write); npm publish step gated on `secrets.NPM_TOKEN` presence (`if: secrets.NPM_TOKEN != ''`) so the pipeline is green before the user creates the token; first publish may be manual per spec assumption.
- **Rationale**: GHCR auth via built-in token = zero secret setup for Docker (FR-011 satisfiable immediately); token-gated npm step encodes the "first publish may be manual" assumption without failing CI.
- **Alternatives considered**: publish on release-created event (tags simpler, no GitHub Release ceremony required); provenance/attestations (nice-to-have, deferred).

## R9. Documentation restructure (FR-014, clarification C)

- **Decision**: README shrinks to: what it is (3 sentences), fastest quickstart (npx + minimal mcp.json), tool table, link index into `docs/`. New `docs/`: `how-it-works.md` (maps, reading order, architecture), `install.md` (all four channels incl. global/local), `transports.md` (stdio + HTTP recipes for VS Code & Claude Desktop, security notes), `docker.md`, `init-command.md`, `troubleshooting.md` (absorbs/expands current README section). Every doc page carries copy-paste-ready snippets using the scoped package name.
- **Rationale**: Matches clarification C exactly; keeps npm README lean while GitHub renders the full guide set.
- **Alternatives considered**: docs site generator (overkill); keeping monolithic README (rejected by clarification).

## R10. Testing strategy (SC-002/003/005/006)

- **Decision**:
  - **Regression gate**: entire feature-001 suite must pass untouched (SC-006).
  - **HTTP e2e**: `tests/integration/httpTransport.test.ts` starts the server with `--http --port 0`-style ephemeral port, connects via SDK `StreamableHTTPClientTransport`, runs the same 4-tool flow as the stdio e2e, diffs outputs modulo timestamp/duration lines (SC-003); adds port-conflict and concurrent-client cases (US2-AS3/4).
  - **Init**: fresh project, existing-servers merge, re-run idempotency, corrupt-JSON abort, guidance opt-in (SC-005 matrix).
  - **Pack smoke**: `npm pack` → install tarball into temp dir → run bin from there against a fixture → maps generated (validates FR-001 prebuilt + FR-004 asset resolution; proxies SC-001/SC-002 registry channel).
  - **Docker smoke**: guarded by docker availability (`describe.runIf`), builds image and runs stdio flow (SC-002 container channel); CI job on Linux runner.
- **Rationale**: Every SC maps to an automated or CI-executed check except the human-timed SC-004 (validated by following docs during review).
- **Alternatives considered**: publishing to a local verdaccio registry in tests (heavier than tarball-install with equal coverage).

## Resolved clarifications carried from /speckit.clarify

| Topic | Resolution |
|---|---|
| Documentation scope | README quickstart + docs/ deep guides; part of definition of done |
| npm package name | `@anhndh1997/workspace-map-mcp`, bin `workspace-map-mcp` (scope revised at publish time) |
