# Implementation Plan: Workspace Mapping Tools (MCP Server)

**Branch**: `001-workspace-map-mcp` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-workspace-map-mcp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build `workspace-map-mcp`: a local MCP (Model Context Protocol) server exposing four tools — `scan_structure` (walk the workspace and write a markdown folder/file tree), `scan_relations` (auto-detect languages and write a markdown map of type→file locations, inheritance/interface implementations, import dependencies, and best-effort method calls), `update_maps` (on-demand incremental refresh of both maps, full generation as fallback), and `install_guidance` (install an agent skill and a managed guidance section in `.github/copilot-instructions.md`). Implemented in TypeScript on Node.js with the official MCP SDK over stdio transport; multi-language parsing via web-tree-sitter (WASM grammars, no native compilation); outputs written atomically to a dedicated `.codemap/` folder at the workspace root, partitioned when large.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js ≥ 20 LTS  
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP server + stdio transport), `web-tree-sitter` (WASM parsers: C#, TypeScript/JavaScript, Python, Java, Go, Rust), `ignore` (.gitignore semantics), `zod` (tool input validation)  
**Storage**: Files — markdown maps + `meta.json` sidecar in `.codemap/` at the workspace root  
**Testing**: Vitest — unit, integration (fixture workspaces), contract tests for tool schemas, perf smoke test with generated 10k-file fixture  
**Target Platform**: Cross-platform Node.js (Windows/macOS/Linux); local stdio MCP server launched per workspace
**Project Type**: Single project — npm package exposing a CLI-launched MCP server (`npx workspace-map-mcp --workspace <path>`)  
**Performance Goals**: Full scan of 10,000 files < 60 s; incremental update of ≤ 100 changed files < 15 s (SC-003, SC-004)  
**Constraints**: Atomic writes (temp file + rename), serialized tool execution (no corrupted concurrent runs), no background watchers or processes, offline-capable (zero network), documents partitioned per top-level folder beyond a size threshold  
**Scale/Scope**: Workspaces up to ~50k files; 6 deeply-parsed languages + regex import fallback for others; 4 MCP tools; 2 generated map documents + 1 metadata sidecar

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Note**: `.specify/memory/constitution.md` is still the unratified template — no project-specific principles exist yet. Generic Spec Kit simplicity gates are applied instead. Recommend running `/speckit.constitution` before implementation.

| Gate (generic) | Status | Evidence |
|---|---|---|
| Simplicity: single project, no speculative layers | PASS | One npm package; no plugin system, no HTTP transport, no watchers in v1 |
| No unjustified new infrastructure | PASS | File-based outputs only; no DB, no services |
| Testability: every FR mapped to testable behavior | PASS | Contract tests for 4 tool schemas; fixture-workspace integration tests; perf fixture for SC-003/004 |
| Observability: tool calls return structured reports | PASS | FR-012 `ToolResultReport` returned by every tool |
| Versioning/compat: stable output contracts | PASS | Map formats + tool schemas documented in `contracts/` |

**Initial evaluation**: PASS (no violations) — see Complexity Tracking (empty).
**Post-design re-evaluation**: PASS — Phase 1 design added no extra projects or infrastructure.

## Project Structure

### Documentation (this feature)

```text
specs/001-workspace-map-mcp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── mcp-tools.md     # Tool input/output JSON schemas
│   └── map-formats.md   # Generated document format contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── index.ts                     # CLI entry: arg parsing (--workspace), starts stdio MCP server
├── server.ts                    # MCP server wiring, tool registration, serialization mutex
├── tools/
│   ├── scanStructure.ts         # scan_structure tool handler
│   ├── scanRelations.ts         # scan_relations tool handler
│   ├── updateMaps.ts            # update_maps tool handler (incremental + full fallback)
│   └── installGuidance.ts       # install_guidance tool handler
├── core/
│   ├── walker.ts                # fs traversal, symlink-cycle guard, deterministic ordering
│   ├── ignoreRules.ts           # built-in default exclusions + .gitignore + user patterns
│   ├── atomicWrite.ts           # temp-file + rename writes
│   └── mutex.ts                 # async serialization of tool executions
├── relations/
│   ├── detect.ts                # language auto-detection (extension + shebang)
│   ├── parserRegistry.ts        # web-tree-sitter grammar loading (lazy, per language)
│   ├── extractors/
│   │   ├── csharp.ts            # types, inheritance, usings, calls
│   │   ├── typescript.ts        # covers TS/TSX/JS/JSX
│   │   ├── python.ts
│   │   ├── java.ts
│   │   ├── go.ts
│   │   └── rust.ts
│   └── fallbackImports.ts       # regex file-level import extraction (reduced analysis)
├── render/
│   ├── structureMarkdown.ts     # structure.md renderer (tree + metadata header)
│   ├── relationsMarkdown.ts     # relations.md renderer (type index + relations)
│   └── partition.ts             # size-threshold split per top-level folder + index doc
├── guidance/
│   ├── skillTemplate.ts         # SKILL.md content for the agent skill
│   └── copilotInstructions.ts   # managed-section merge into .github/copilot-instructions.md
└── meta/
    └── metadata.ts              # .codemap/meta.json read/write, per-file hashes, staleness

tests/
├── contract/                    # tool schema + result-report shape tests
├── integration/                 # end-to-end against fixture workspaces
├── unit/                        # walker, ignore, extractors, renderers, merge logic
└── fixtures/                    # sample workspaces (multi-language, symlinks, name collisions, 10k-file perf generator)
```

**Structure Decision**: Single-project npm package (Option 1 equivalent). The MCP server is a thin transport layer (`server.ts`) over pure library functions in `core/`, `relations/`, `render/`, `guidance/`, and `meta/`, keeping every behavior unit-testable without a running MCP client. Generated artifacts land in the target workspace's `.codemap/` folder (never inside this repo's `src/`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations — table intentionally empty.
