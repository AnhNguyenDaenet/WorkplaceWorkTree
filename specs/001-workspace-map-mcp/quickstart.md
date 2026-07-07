# Quickstart: Workspace Mapping Tools (MCP Server)

**Feature**: 001-workspace-map-mcp | **Date**: 2026-07-07
**Goal**: From zero to both maps generated and AI guidance installed in under 5 minutes (SC-005).

## Prerequisites

- Node.js ≥ 20 LTS (`node --version`)
- An MCP-compatible client (VS Code with GitHub Copilot, Claude Desktop, etc.)

## 1. Register the server with your client

### VS Code (`.vscode/mcp.json` in your workspace)

```json
{
  "servers": {
    "workspace-map": {
      "command": "npx",
      "args": ["workspace-map-mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "workspace-map": {
      "command": "npx",
      "args": ["workspace-map-mcp", "--workspace", "C:/path/to/your/workspace"]
    }
  }
}
```

Reload the client; it should list four tools: `scan_structure`, `scan_relations`, `update_maps`, `install_guidance`.

## 2. Generate the maps

Ask your AI assistant (or invoke the tools directly):

1. **`scan_structure`** → writes `.codemap/structure.md` — the full folder/file tree with relative paths.
2. **`scan_relations`** → writes `.codemap/relations.md` — type→file index, inheritance/interfaces, imports, best-effort calls.

Each call returns a result report (files written, counts, duration, warnings).

## 3. Install AI guidance

3. **`install_guidance`** → writes:
   - `.github/skills/workspace-map/SKILL.md` — agent skill teaching assistants to consult the maps,
   - a managed section in `.github/copilot-instructions.md` (created if missing; your existing content is preserved).

## 4. Day-to-day use

- AI assistants now read `.codemap/structure.md` to resolve paths and `.codemap/relations.md` to jump to types — no more workspace-wide searching.
- After adding/removing/renaming files or changing class relationships, run **`update_maps`** (incremental, seconds). Use `{"force": true}` to rebuild from scratch.

## 5. Verify (acceptance smoke)

| Check | Expectation |
|---|---|
| `.codemap/structure.md` exists, lists your files, header shows timestamp + exclusions | US1 |
| `.codemap/relations.md` maps a known class to its defining file with inheritance listed | US2 |
| Rename a file → `update_maps` → old path gone from both docs | US3 |
| `.github/copilot-instructions.md` contains the `workspace-map-mcp` managed block, your content intact | US4 |
| Re-run `install_guidance` → still exactly one managed block | US4-AS4 |

## Troubleshooting

- **"workspace root not found"** — pass an absolute path to `--workspace`; check it is readable.
- **Huge repo, slow scan** — add `excludePatterns` (e.g., `["third_party/**"]`); check the exclusions header to confirm rules applied.
- **A language shows "fallback" tier** — only file-level imports are extracted for it in v1; type detail is limited to the six deep-parse languages (C#, TS/JS, Python, Java, Go, Rust).
- **Maps look stale** — the generation timestamp is in each document header; run `update_maps`.
