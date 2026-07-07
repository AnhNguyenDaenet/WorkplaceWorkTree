# Research: Workspace Mapping Tools (MCP Server)

**Feature**: 001-workspace-map-mcp | **Date**: 2026-07-07
**Purpose**: Resolve technology and approach decisions for the Technical Context in [plan.md](./plan.md). No NEEDS CLARIFICATION markers remained in the spec (all resolved interactively during `/speckit.specify`); this document records the technology decisions and their rationale.

## R1. Server runtime & language

- **Decision**: TypeScript 5.x on Node.js ≥ 20 LTS.
- **Rationale**: The official MCP TypeScript SDK (`@modelcontextprotocol/sdk`) is the reference implementation with first-class stdio transport; Node.js is already present for virtually every VS Code / Copilot user, enabling frictionless `npx` launch; single language for server, scanners, and renderers keeps the project one package.
- **Alternatives considered**:
  - *Python + `mcp` SDK*: equally capable, but adds a Python runtime prerequisite for a tool aimed at arbitrary (often .NET/JS) workspaces and complicates single-command distribution.
  - *C#/.NET MCP SDK*: attractive given the user's .NET background, but the SDK is younger, WASM-based multi-language parsing is less mature, and `dotnet tool` distribution has more setup friction than `npx`.

## R2. MCP exposure & transport

- **Decision**: Local stdio-transport MCP server, launched per workspace via CLI (`npx workspace-map-mcp --workspace <abs-path>`), registered in clients through standard MCP config (e.g., `.vscode/mcp.json`).
- **Rationale**: Stdio is the simplest, most widely supported MCP transport (works with VS Code Copilot, Claude Desktop, and every mainstream MCP client); no ports, no auth surface, offline by design — matching the spec assumption that the server "runs alongside the workspace".
- **Alternatives considered**:
  - *Streamable HTTP transport*: enables shared/team hosting, but the spec explicitly defers remote hosting to a future enhancement; HTTP adds auth/session complexity now for no v1 requirement.
  - *Both transports*: rejected for v1 scope control (YAGNI); the tool layer is transport-agnostic, so HTTP can be added later without redesign.

## R3. Multi-language parsing strategy

- **Decision**: `web-tree-sitter` (tree-sitter compiled to WASM) with lazily-loaded grammars for C#, TypeScript/JavaScript (incl. TSX/JSX), Python, Java, Go, Rust; regex-based file-level import fallback for all other text files.
- **Rationale**: One uniform parsing API across all six languages; WASM grammars mean **no native compilation or node-gyp** at install time (critical for Windows friendliness); tree-sitter is error-tolerant, so files with syntax errors still yield partial results — directly supporting FR-011 graceful degradation; queries can extract type declarations, base lists, imports, and call expressions per language.
- **Alternatives considered**:
  - *Per-language native compilers (Roslyn, ts-morph, etc.)*: highest fidelity but one heavyweight dependency per language, mixed runtimes, and no uniform model — contradicts "auto-detect major languages" breadth.
  - *LSP servers per language*: most accurate call graphs, but requires installing/starting a language server per language — far too heavy for an on-demand scanner.
  - *Regex-only for everything*: fast and simple but cannot reliably extract inheritance or method calls; kept only as the fallback tier.
- **Consequence recorded in map**: method call/reference extraction is syntactic (name-based, best-effort), not semantically resolved; relations.md labels call data accordingly (matches spec's "best-effort" language).

## R4. Language auto-detection

- **Decision**: File-extension mapping (primary) plus shebang sniffing for extensionless scripts; detection summary (files per language, files on fallback tier) recorded in relations.md metadata.
- **Rationale**: Extension mapping is deterministic, instant, and correct for the six deep-parse languages; satisfies FR-003 auto-detection without content heuristics that can misfire.
- **Alternatives considered**: content-based detectors (linguist-style heuristics) — more accurate for exotic files but slower and unnecessary for v1's language set.

## R5. Ignore/exclusion semantics

- **Decision**: Three layered rules, all reported in the generated document header (FR-002): (1) built-in defaults — `.git`, `node_modules`, `bin`, `obj`, `dist`, `build`, `out`, `.vs`, `.idea`, `__pycache__`, `.venv`, `venv`, `target`, `packages`, `.codemap`; (2) workspace `.gitignore` files honored via the `ignore` npm package (battle-tested gitignore semantics, nested-file support); (3) user-supplied extra include/exclude glob patterns via tool input.
- **Rationale**: Matches FR-002 exactly; `ignore` package replicates git's matching rules rather than approximating them; the map folder self-exclusion prevents recursive self-description (edge case in spec).
- **Alternatives considered**: shelling out to `git ls-files` (fails on non-git workspaces); hand-rolled glob matching (subtle gitignore incompatibilities).

## R6. Symlink-cycle safety

- **Decision**: Track visited real paths (`fs.realpath`) during traversal; a directory whose real path was already visited is recorded once with a `→ symlink` marker and not descended into again. Traversal uses iterative BFS with deterministic alphabetical ordering.
- **Rationale**: Guarantees termination on junction/symlink cycles (spec edge case) and produces stable, diff-friendly output ordering.
- **Alternatives considered**: skipping all symlinks entirely — simpler but silently hides legitimately linked source folders.

## R7. Output artifacts, partitioning & atomicity

- **Decision**:
  - Folder: `.codemap/` at workspace root (user-chosen "dedicated folder" option).
  - Files: `structure.md`, `relations.md`, `meta.json`, plus `structure/<top-level-folder>.md` and `relations/<top-level-folder>.md` partitions when a document would exceed ~1,500 lines; the root document then becomes an index with links and summary counts (FR-015).
  - Atomicity: every write goes to `<name>.tmp` in the same directory followed by `fs.rename` (same-volume rename is atomic on Windows/NTFS and POSIX), satisfying FR-014.
- **Rationale**: Stable predictable names (FR-007); partition-by-top-level-folder is the scheme the spec itself suggests; temp+rename is the standard atomic-write pattern with zero dependencies.
- **Alternatives considered**: single giant file with anchors (breaks AI context windows on big repos); SQLite index (not human/AI-readable markdown, violates the explicit markdown requirement).

## R8. Incremental update strategy

- **Decision**: `meta.json` stores per-file `{ relativePath, size, mtimeMs, contentHash (xxhash/sha1), language, typeIds }`. `update_maps` re-walks the tree (cheap), diffs against `meta.json` to classify added/removed/changed files, re-parses only changed/added files, patches the in-memory model, and re-renders affected documents. Missing/corrupt `meta.json` or missing maps → full generation fallback (FR-005). A process-wide async mutex serializes all tool executions; a queued second call waits, satisfying the concurrency edge case.
- **Rationale**: Meets SC-004 (≤100 changed files in <15 s) because parse cost — the dominant cost — scales with changed files only; re-walking (not watching) keeps the "no background processes" constraint.
- **Alternatives considered**: file watchers (explicitly rejected by user choice); git-status-based diffing (misses untracked/ignored-file nuances and fails on non-git workspaces); rejecting concurrent calls with an error (queueing is friendlier and equally safe — either is spec-compliant, queueing chosen).

## R9. Type disambiguation model (FR-013)

- **Decision**: Every type entry gets a stable ID `<language>:<qualifier>.<TypeName>@<relativePath>` where qualifier = namespace (C#/Java), module path (TS/Python/Go/Rust). relations.md renders collision groups under a disambiguation note listing each candidate with its qualifier and path.
- **Rationale**: Qualified-name-plus-path is guaranteed unique even for identically named partial/duplicate types; readable by both AI and humans.
- **Alternatives considered**: numeric IDs (opaque to AI readers); path-only keys (breaks for multiple types per file).

## R10. Agent skill & copilot-instructions integration (FR-009/FR-010)

- **Decision**: `install_guidance` tool writes (a) a skill file `.github/skills/workspace-map/SKILL.md` instructing agents to read `.codemap/structure.md` for path resolution, `.codemap/relations.md` for type navigation, and to call `update_maps` when maps look stale; and (b) a managed block in `.github/copilot-instructions.md` delimited by `<!-- BEGIN workspace-map-mcp -->` / `<!-- END workspace-map-mcp -->` — created if the file is absent, replaced in place if the markers exist, appended otherwise. All existing content outside the markers is preserved byte-for-byte (FR-010, US4 acceptance scenarios).
- **Rationale**: Marker-delimited managed sections are the established convention (used by Spec Kit's own update-agent-context script) for idempotent re-runs without duplicating sections.
- **Alternatives considered**: separate instructions file referenced from copilot-instructions.md (extra indirection; the user explicitly asked for guidance *in* copilot-instructions.md).

## R11. Testing approach

- **Decision**: Vitest. Test tiers: **contract** (zod schemas of the 4 tool inputs/outputs, result-report shape), **unit** (walker, ignore layering, each language extractor against snippet fixtures, renderers, managed-section merge), **integration** (fixture workspaces: multi-language sample, symlink cycle, name collisions, docs-only, unparseable files), **performance smoke** (script-generated 10k-file fixture asserting SC-003/SC-004 budgets).
- **Rationale**: Vitest is the current default for TS libraries (fast, ESM-native, built-in snapshots for markdown output comparison); fixture workspaces make every spec edge case a repeatable test.
- **Alternatives considered**: Jest (slower ESM story), node:test (weaker snapshot/watch ergonomics).

## R12. Distribution

- **Decision**: Publishable npm package with `bin` entry `workspace-map-mcp`; run via `npx workspace-map-mcp --workspace <path>`; WASM grammar files shipped in the package. README + quickstart document client registration (VS Code `.vscode/mcp.json` example included).
- **Rationale**: Single-command setup satisfies SC-005 (connect + produce maps in <5 minutes); shipping WASM avoids postinstall downloads (offline constraint).
- **Alternatives considered**: VS Code extension wrapper (limits to one client; MCP config reaches all clients); global install requirement (npx avoids it).

## Resolved clarifications carried from /speckit.specify

| Topic | Resolution (user-selected) |
|---|---|
| Language support | Auto-detect major languages (deep tier: C#, TS/JS, Python, Java, Go, Rust; fallback tier: regex imports) |
| Update trigger | On-demand only; no watchers, no git hooks |
| Relation types | Type→file, inheritance/interfaces, imports/usings, best-effort method calls |
| Output location | Dedicated `.codemap/` folder at workspace root |
