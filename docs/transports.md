# Transports

The server speaks MCP over two transports. **stdio is the default** — nothing changed for existing setups. HTTP is an explicit opt-in for long-running/shared processes.

```text
workspace-map-mcp --workspace <abs-path> [--max-doc-lines <n>]                 # stdio (default)
workspace-map-mcp --workspace <abs-path> --http --port <n> [--host <addr>]    # HTTP
```

`--workspace` is required in both modes and must be an absolute path to an existing readable directory.

## stdio recipes

The client spawns the server per session; no manual process management.

**VS Code** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "workspace-map": {
      "command": "npx",
      "args": [
        "@anhndh1997/workspace-map-mcp",
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

Globally installed command instead of npx:

```json
{
  "servers": {
    "workspace-map": {
      "command": "workspace-map-mcp",
      "args": [
        "--workspace",
        "${workspaceFolder}"
      ]
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json` (no `${workspaceFolder}` variable — use the literal path):

```json
{
  "mcpServers": {
    "workspace-map": {
      "command": "npx",
      "args": [
        "@anhndh1997/workspace-map-mcp",
        "--workspace",
        "C:/path/to/your/project"
      ]
    }
  }
}
```

Docker-stdio variant: see [docker.md](./docker.md).

## HTTP recipes

Start the server yourself (terminal, service, or container):

```powershell
workspace-map-mcp --workspace C:\path\to\project --http --port 3579
```

Endpoint: `POST/GET/DELETE http://127.0.0.1:3579/mcp` (MCP Streamable HTTP, stateless). Any other path returns 404.

**VS Code** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "workspace-map": {
      "url": "http://127.0.0.1:3579/mcp"
    }
  }
}
```

Notes:

- One server instance serves **one workspace** (the `--workspace` it was started with).
- Concurrent clients are safe: tool executions are serialized process-wide; queued calls carry a `queued for <n> ms` warning in their report. Results are identical to stdio.
- Port already taken → the server prints `port <n> is already in use…` and exits 1.
- Graceful shutdown: on SIGINT/SIGTERM the server stops accepting requests, drains in-flight work, and exits 0 — maps are never left half-written.

## Security (HTTP)

- Binds **127.0.0.1 by default**. Only same-machine clients can connect.
- `--host <addr>` (e.g. `--host 0.0.0.0`) is an **explicit opt-in** for other interfaces. v1 has **no authentication and no TLS** — expose it on trusted networks only. Inside containers `--host 0.0.0.0` is required and safe because exposure is controlled by `-p` port publishing (see [docker.md](./docker.md)).
- The startup log always states transport, bind address, and workspace.

## Verifying parity

The same four tools with identical behavior are served on both transports; the test suite asserts byte-equivalent outputs (modulo timestamps) between HTTP and stdio runs.
