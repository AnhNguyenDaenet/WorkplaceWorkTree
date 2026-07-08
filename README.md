# workspace-map-mcp

An MCP (Model Context Protocol) server that maps any workspace into plain-markdown documents — folder/file tree plus code relations (types, inheritance, imports, calls) — so AI assistants navigate **directly** instead of searching. Offline tree-sitter WASM parsing, atomic writes, no watchers.

## Quick start (fastest path: npx)

Add to your project's `.vscode/mcp.json` — done:

```json
{
  "servers": {
    "workspace-map": {
      "command": "npx",
      "args": ["@anhndh1997/workspace-map-mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

Or let the CLI write that file for you (and optionally install agent guidance):

```powershell
npx @anhndh1997/workspace-map-mcp init --guidance --yes
```

Reload your MCP client, then ask your assistant to run `scan_structure` and `scan_relations`. Maps land in `<workspace>/.codemap/`.

Requires Node.js ≥ 20 (or use the [Docker image](docs/docker.md)). Verify any install with `workspace-map-mcp --version`.

## The four tools

| Tool | What it does |
|---|---|
| `scan_structure` | Writes `.codemap/structure.md` — full tree, workspace-relative paths |
| `scan_relations` | Writes `.codemap/relations.md` — type→file index, inheritance, imports, calls (C#, TS/JS, Python, Java, Go, Rust; import fallback elsewhere) |
| `update_maps` | Incremental refresh of both maps (`{"force": true}` for full rebuild) |
| `install_guidance` | Installs an agent skill + managed copilot-instructions section teaching assistants to use the maps |

## Server CLI

```text
workspace-map-mcp --workspace <abs-path> [--max-doc-lines <n>]                # stdio (default)
workspace-map-mcp --workspace <abs-path> --http --port <n> [--host <addr>]   # HTTP (localhost-bound)
workspace-map-mcp init [--target <dir>] [--transport stdio|http] [--channel npx|global|docker] [--guidance] [--yes]
workspace-map-mcp --version
```

## Documentation

| Guide | Content |
|---|---|
| [docs/how-it-works.md](docs/how-it-works.md) | The maps, reading order for agents, architecture, exclusions |
| [docs/install.md](docs/install.md) | All install channels: npx/registry, GitHub, global/link, Docker |
| [docs/transports.md](docs/transports.md) | stdio + HTTP recipes for VS Code & Claude Desktop, security notes |
| [docs/docker.md](docs/docker.md) | Container run modes, bind-mount rules, GHCR tags |
| [docs/init-command.md](docs/init-command.md) | `init` flags, merge behavior, entry variants |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Errors and fixes, development setup |

## License

MIT
