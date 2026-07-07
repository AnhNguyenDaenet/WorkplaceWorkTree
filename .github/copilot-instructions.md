# WorkplaceWorkTree Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-07

## Active Technologies
- TypeScript 5.x on Node.js ≥ 20 LTS (unchanged from feature 001) + `@modelcontextprotocol/sdk` (adds `StreamableHTTPServerTransport` + Node `http` server), existing `web-tree-sitter`/`ignore`/`zod`; no new runtime dependencies — HTTP layer uses Node built-ins (002-hostable-mcp-distribution)
- Files — unchanged `.codemap/` outputs; new writes: target project's `.vscode/mcp.json` (merge), docs/ content in this repo (002-hostable-mcp-distribution)

- TypeScript 5.x on Node.js ≥ 20 LTS + `@modelcontextprotocol/sdk` (MCP server + stdio transport), `web-tree-sitter` (WASM parsers: C#, TypeScript/JavaScript, Python, Java, Go, Rust), `ignore` (.gitignore semantics), `zod` (tool input validation) (001-workspace-map-mcp)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x on Node.js ≥ 20 LTS: Follow standard conventions

## Recent Changes
- 002-hostable-mcp-distribution: Added TypeScript 5.x on Node.js ≥ 20 LTS (unchanged from feature 001) + `@modelcontextprotocol/sdk` (adds `StreamableHTTPServerTransport` + Node `http` server), existing `web-tree-sitter`/`ignore`/`zod`; no new runtime dependencies — HTTP layer uses Node built-ins

- 001-workspace-map-mcp: Added TypeScript 5.x on Node.js ≥ 20 LTS + `@modelcontextprotocol/sdk` (MCP server + stdio transport), `web-tree-sitter` (WASM parsers: C#, TypeScript/JavaScript, Python, Java, Go, Rust), `ignore` (.gitignore semantics), `zod` (tool input validation)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- BEGIN workspace-map-mcp -->
## Workspace maps (generated)

- `.codemap/structure.md` — full folder/file tree; read this to resolve any relative path instead of listing directories.
- `.codemap/relations.md` — type→file index, inheritance, imports, calls; read this to jump straight to a type's defining file instead of searching.
- If either file is missing or looks stale (see its generation timestamp), call the `update_maps` tool on the `workspace-map-mcp` MCP server.
<!-- END workspace-map-mcp -->
