# Docker

Image: `ghcr.io/anhnguyendaenet/workspace-map-mcp` — tags `latest` and one per release version (`0.2.0`, …). Built on `node:20-slim`, runs as non-root `node`, ships prebuilt code + grammars (never compiles at runtime).

```powershell
docker pull ghcr.io/anhnguyendaenet/workspace-map-mcp:latest
```

> **Pulling is automatic**: `docker run` downloads the image on first use when it isn't cached locally (default `--pull=missing`), so the explicit `docker pull` above is optional. It is still recommended once up front because a cold download during the first MCP client launch can exceed the client's server-start timeout (the entry works on the next attempt once the pull finished). Note that a cached `latest` is never re-checked — re-run `docker pull` to update, or add `--pull=always` to the run args to check the registry on every launch.

## Bind-mount rules

- Mount your project at `/workspace` and pass `--workspace /workspace`.
- Maps are written **back to your host project** through the mount (`<project>/.codemap/`).
- All recorded paths are workspace-relative — container-absolute paths like `/workspace/...` never appear inside generated documents, so maps are fully portable between container and host.
- On Linux hosts add `--user $(id -u):$(id -g)` so files created in the mount belong to you.

## stdio mode (per-project, spawned by the client)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "workspace-map": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "${workspaceFolder}:/workspace",
        "ghcr.io/anhnguyendaenet/workspace-map-mcp",
        "--workspace",
        "/workspace"
      ]
    }
  }
}
```

`docker run -i` keeps stdin open — that *is* the MCP channel; the client manages the container's lifetime. If the image is missing, this first launch pulls it automatically; pre-pull (above) to avoid a slow first start. To always track the newest `latest`, insert `"--pull=always",` right after `"run",` in the args.

## HTTP mode (long-running)

```powershell
docker run -d --rm `
  -v C:\path\to\project:/workspace `
  -p 3579:3579 `
  ghcr.io/anhnguyendaenet/workspace-map-mcp `
  --workspace /workspace --http --port 3579 --host 0.0.0.0
```

Client entry: `{ "url": "http://127.0.0.1:3579/mcp" }`.

Why `--host 0.0.0.0` here and not natively? Inside the container, loopback would be reachable only from the container itself. Binding all container interfaces is safe because **exposure is controlled solely by `-p`**: publish `-p 127.0.0.1:3579:3579` to keep it host-local, or omit `-p` entirely for compose-network-only access. The localhost-by-default rule still applies to native (non-container) runs.

## CI publishing

Pushing a tag `v<version>` builds and pushes `:<version>` + `:latest` to GHCR automatically (see `.github/workflows/release.yml`); the tag must match `package.json` version or the workflow fails.
