# Quickstart: Hostable MCP Server Distribution & Multi-Project Connection

**Feature**: 002-hostable-mcp-distribution | **Date**: 2026-07-07
**Goal**: Validate every distribution channel and transport connects a *different* project in minutes.

## Prerequisites

- Node.js ≥ 20; Docker only for the container path
- A target project separate from this repository

## 1. Pick a channel and install

```powershell
# A) npm registry (after publish)
npx @anhnguyendaenet/workspace-map-mcp --version

# B) straight from GitHub (self-builds on install)
npm install -g github:AnhNguyenDaenet/WorkplaceWorkTree
workspace-map-mcp --version

# C) local clone, global command
git clone https://github.com/AnhNguyenDaenet/WorkplaceWorkTree; cd WorkplaceWorkTree
npm install; npm run build; npm link
workspace-map-mcp --version

# D) Docker
docker pull ghcr.io/anhnguyendaenet/workspace-map-mcp:latest
```

## 2. Connect your other project

### Fastest: init command

```powershell
cd C:\path\to\other-project
workspace-map-mcp init --channel npx --guidance --yes
```

Creates/merges `.vscode/mcp.json` (other servers preserved), optionally installs the agent skill + copilot-instructions section, prints next steps.

### Manual: copy a recipe

`.vscode/mcp.json` in the target project:

```json
{
  "servers": {
    "workspace-map": {
      "command": "npx",
      "args": ["@anhnguyendaenet/workspace-map-mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

Docker-stdio and HTTP-URL variants: see docs/transports.md and docs/docker.md.

## 3. HTTP mode (long-running / containers)

```powershell
workspace-map-mcp --workspace C:\path\to\other-project --http --port 3579
```

Client entry: `{ "url": "http://127.0.0.1:3579/mcp" }`. Binds localhost by default; `--host 0.0.0.0` is an explicit opt-in (trusted networks only, no auth in v1).

## 4. Verify (acceptance smoke)

| Check | Expectation | Maps to |
|---|---|---|
| `--version` prints the same version on every installed channel | consistent build | FR-015, SC-002 |
| npx run on clean machine → maps in target project < 3 min | works without clone/build | SC-001, US1 |
| HTTP client completes scan flow; diff vs stdio only timestamps | transport parity | SC-003, US2 |
| Second server on same port → clear error | port conflict handling | US2-AS3 |
| Docker stdio writes maps to host project; no `/workspace` strings inside docs | path translation | US3-AS3 |
| `init` re-run → single `workspace-map` entry, other servers untouched | idempotent merge | US4-AS2, SC-005 |
| Feature-001 test suite green, unchanged | zero regressions | SC-006 |

## 5. Docs map (definition of done includes these)

README (quickstart) → docs/install.md · docs/transports.md · docs/docker.md · docs/init-command.md · docs/how-it-works.md · docs/troubleshooting.md
