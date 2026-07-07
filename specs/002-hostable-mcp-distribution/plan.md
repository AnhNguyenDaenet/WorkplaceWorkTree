# Implementation Plan: Hostable MCP Server Distribution & Multi-Project Connection

**Branch**: `002-hostable-mcp-distribution` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-hostable-mcp-distribution/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Make the existing `workspace-map-mcp` server obtainable and connectable from any project: (1) rename the package to `@anhnguyendaenet/workspace-map-mcp` (bin stays `workspace-map-mcp`), ship prebuilt `dist/` + WASM grammars in the npm tarball, and make `prepare` build automatically so GitHub installs work; (2) add an opt-in HTTP transport (`--http --port <n>`, localhost-bound by default via the MCP SDK Streamable HTTP server transport) while stdio remains the unchanged default; (3) add a Dockerfile + GitHub Actions CI that validates the package on push and publishes the image to GHCR on tags; (4) add an `init` subcommand that merges a server entry into the target project's `.vscode/mcp.json` and optionally runs the existing guidance installer; (5) restructure documentation into a concise README quickstart plus `docs/` deep guides. Grammar-asset resolution is hardened to work from every install location (npx cache, global, link, container).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js ≥ 20 LTS (unchanged from feature 001)  
**Primary Dependencies**: `@modelcontextprotocol/sdk` (adds `StreamableHTTPServerTransport` + Node `http` server), existing `web-tree-sitter`/`ignore`/`zod`; no new runtime dependencies — HTTP layer uses Node built-ins  
**Storage**: Files — unchanged `.codemap/` outputs; new writes: target project's `.vscode/mcp.json` (merge), docs/ content in this repo  
**Testing**: Vitest (existing suites must pass unchanged — SC-006); new: HTTP-transport e2e via MCP SDK `StreamableHTTPClientTransport`, init-command integration tests, pack/install smoke via `npm pack` + install-from-tarball; Docker smoke optional-gated (skipped when docker unavailable)  
**Target Platform**: Cross-platform Node.js; Docker image linux/amd64 (arm64 if runner permits) published to GHCR  
**Project Type**: Single npm package (unchanged) + Dockerfile + GitHub Actions workflows
**Performance Goals**: Clean-machine `npx` first run < 3 min incl. download (SC-001); HTTP flow byte-equivalent to stdio modulo timestamps (SC-003); no regression to feature-001 scan budgets  
**Constraints**: Stdio default & backward compatible (FR-006); `--workspace` stays required (FR-008); HTTP binds localhost unless explicit opt-in (FR-007); serialized execution + atomic writes hold across concurrent HTTP clients (FR-009); no auth/TLS in v1 (documented); registry installs require no build toolchain (FR-001)  
**Scale/Scope**: 4 distribution channels, 2 transports, 1 new CLI subcommand (`init`) + `--version`, ~6 docs pages, 2 CI workflows; single workspace per server instance (multi-workspace routing out of scope)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Note**: `.specify/memory/constitution.md` remains the unratified template (unchanged since feature 001). The same generic Spec Kit gates are applied.

| Gate (generic) | Status | Evidence |
|---|---|---|
| Simplicity: no speculative layers | PASS | HTTP is flag-gated reuse of SDK transport; no auth/TLS/multi-workspace in v1; no new runtime deps |
| No unjustified new infrastructure | PASS | CI + Dockerfile are the deliverable (FR-010/011), not incidental infra; no DB/services |
| Testability: every FR mapped to testable behavior | PASS | HTTP e2e mirrors stdio e2e; init merge tests; pack/install smoke; SC-006 regression gate |
| Observability: structured reports | PASS | ToolResultReport unchanged across transports; init prints structured result |
| Versioning/compat: stable contracts | PASS | FR-006 backward compat; FR-015 `--version`; map formats untouched |

**Initial evaluation**: PASS (no violations).
**Post-design re-evaluation**: PASS — Phase 1 added only transport config, init contract, and docs structure; no extra projects.

## Project Structure

### Documentation (this feature)

```text
specs/002-hostable-mcp-distribution/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── cli.md           # CLI surface: server flags, init subcommand, --version
│   └── packaging.md     # npm tarball, GitHub-install build, Docker image, CI triggers
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/                                 # existing feature-001 code (unchanged unless noted)
├── index.ts                         # MODIFIED: subcommand routing (default serve | init | --version), --http/--port/--host flags
├── server.ts                        # unchanged (transport-agnostic tool registration)
├── transport/
│   ├── stdio.ts                     # NEW: extracted stdio connect (current behavior)
│   └── http.ts                      # NEW: StreamableHTTPServerTransport + Node http server, localhost default, graceful shutdown
├── cli/
│   ├── args.ts                      # NEW: shared arg parsing/validation (workspace, port, host, version)
│   └── init.ts                      # NEW: init subcommand — mcp.json merge + optional guidance install + result print
├── core/assets.ts                   # NEW: robust grammar/asset path resolution for all install locations
└── relations/parserRegistry.ts      # MODIFIED: use core/assets.ts resolver

docs/                                # NEW: deep guides (FR-014b)
├── how-it-works.md                  # maps, tools, reading order, architecture overview
├── install.md                       # npm registry, GitHub install, global install, npx
├── transports.md                    # stdio + HTTP recipes, all mcp.json snippets, security notes
├── docker.md                        # image usage stdio/HTTP, bind mounts, GHCR tags
├── init-command.md                  # init flags, merge behavior, examples
└── troubleshooting.md               # moved/expanded from README

Dockerfile                           # NEW: node:20-slim, prebuilt dist + grammars, ENTRYPOINT server
.dockerignore                        # NEW
.github/workflows/
├── ci.yml                           # NEW: push/PR — lint, build, test, npm pack validation
└── release.yml                      # NEW: tag — docker build+push GHCR; npm publish (token-gated)

README.md                            # REWRITTEN: concise quickstart + links into docs/
package.json                         # MODIFIED: scoped name, publishConfig access public, prepare builds, files+docs

tests/
├── contract/cliArgs.test.ts         # NEW: arg/flag validation contract
├── integration/httpTransport.test.ts# NEW: HTTP e2e mirroring stdio e2e (SC-003)
├── integration/initCommand.test.ts  # NEW: mcp.json create/merge/idempotent + guidance opt-in
└── integration/packSmoke.test.ts    # NEW: npm pack → install tarball in temp dir → launch → tools work
```

**Structure Decision**: Remains a single npm package. The entry point splits into thin `transport/` and `cli/` layers over the untouched `server.ts` tool registration, so both transports and the init command share one code path and the whole feature-001 test suite runs unchanged (SC-006). Docker/CI are repository-level artifacts, not code modules.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations — table intentionally empty.
