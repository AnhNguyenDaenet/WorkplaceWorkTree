# How It Works

`workspace-map-mcp` generates **plain-markdown maps** of a workspace so AI assistants can navigate directly to files and types instead of searching.

## The maps

| File | Content |
|---|---|
| `.codemap/structure.md` | Full folder/file tree; every file line carries its workspace-relative path |
| `.codemap/structure/<folder>.md` | Per-top-level-folder partitions when the tree exceeds `--max-doc-lines` |
| `.codemap/relations.md` | Type→file index, inheritance/interface implementations, import/using dependencies, best-effort method calls |
| `.codemap/relations/<folder>.md` | Partitions for large relation maps |
| `.codemap/meta.json` | Scan metadata powering incremental updates (not for human consumption) |

Every document starts with a header: generator version, generation timestamp, format version, and the full list of applied exclusions — check it to judge freshness.

## Reading order for agents

1. `structure.md` — resolve any relative path without listing directories.
2. `relations.md` — jump straight to a type's defining file; follow inheritance/imports.
3. When either looks stale (timestamp header), call `update_maps`.

The `install_guidance` tool teaches this to your assistant automatically (agent skill + managed section in `.github/copilot-instructions.md`).

## The four tools

| Tool | Input | Writes |
|---|---|---|
| `scan_structure` | `includePatterns?`, `excludePatterns?` (gitignore-style globs) | `structure.md` (+ partitions) |
| `scan_relations` | `includePatterns?`, `excludePatterns?`, `includeCalls?` (default true) | `relations.md` (+ partitions) |
| `update_maps` | `force?` (default false) | Both maps + `meta.json` |
| `install_guidance` | `copilotInstructionsPath?` (default `.github/copilot-instructions.md`) | Skill + managed instructions section |

Every call returns a JSON report: `status` (`success`/`partial`/`error`), `filesWritten`, `counts`, `durationMs`, `warnings`, `errors`.

## Architecture sketch

```text
MCP client (stdio or HTTP)
        │
   src/index.ts        thin CLI router: serve (default) | init | --version
        │
   src/server.ts       tool registration; process-wide mutex serializes every execution
        │
   src/tools/*         scan_structure · scan_relations · update_maps · install_guidance
        │
   src/core/*          walker (.gitignore semantics) · atomic writes · asset resolution
   src/relations/*     tree-sitter WASM extractors (C#, TS/JS, Python, Java, Go, Rust)
        │
   src/render/*        markdown rendering + partitioning
        ▼
   <workspace>/.codemap/
```

- **Offline by design**: tree-sitter grammars ship as WASM inside the package — no network, no native compilation at runtime.
- **Atomic writes**: every document is written to a temp file and renamed — a crash never leaves a half-written map.
- **Serialized execution**: one tool runs at a time (per process), including across concurrent HTTP clients; queued callers get a `queued for <n> ms` warning in their report.

## Language depth

Deep analysis (types, inheritance, calls): **C#, TypeScript/JavaScript, Python, Java, Go, Rust.**
Other languages fall back to file-level import extraction (marked `fallback (imports only)` in the map).

## Staleness & updates

`update_maps` diffs the workspace against `meta.json` (mtimes/sizes) and rewrites only what changed; `{"force": true}` rebuilds from scratch. There are no watchers or background processes — refresh happens only when the tool is called.

## Exclusions

Three layers, all listed in each document header:

1. **Built-in defaults** (non-overridable): `.git`, `node_modules`, `bin`, `obj`, `dist`, `build`, `out`, `.vs`, `.idea`, `__pycache__`, `.venv`, `venv`, `target`, `packages`, `.codemap`
2. **Workspace `.gitignore` files** (nested supported)
3. **Your `excludePatterns`** — re-includable via `includePatterns`
