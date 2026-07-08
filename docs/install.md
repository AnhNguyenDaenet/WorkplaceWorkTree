# Installation

Four channels — pick one. Requirement everywhere: **Node.js ≥ 20** (Docker channel excepted).
Verify any install with `--version` (must print the same version on every channel of a release).

## 1. npm registry (recommended, zero-install via npx)

No install step at all — MCP clients spawn it on demand:

```powershell
npx @anhndh1997/workspace-map-mcp --version
```

The published tarball ships prebuilt code and all WASM grammars; **no build toolchain is required** on your machine.

Permanent global install from the registry:

```powershell
npm install -g @anhndh1997/workspace-map-mcp
workspace-map-mcp --version
```

## 2. Straight from GitHub (self-builds on install)

```powershell
npm install -g github:AnhNguyenDaenet/WorkplaceWorkTree
workspace-map-mcp --version
```

npm installs devDependencies for git dependencies and runs the package's guarded `prepare` script — grammars and compiled output are produced automatically during installation.

## 3. Local clone → global command

```powershell
git clone https://github.com/AnhNguyenDaenet/WorkplaceWorkTree
cd WorkplaceWorkTree
npm install
npm run build
npm link          # or: npm install -g .
workspace-map-mcp --version
```

Undo with `npm uninstall -g @anhndh1997/workspace-map-mcp`.

## 4. Docker (GHCR)

```powershell
docker pull ghcr.io/anhnguyendaenet/workspace-map-mcp:latest
docker run --rm ghcr.io/anhnguyendaenet/workspace-map-mcp --version
```

Run recipes (bind mounts, stdio vs HTTP): see [docker.md](./docker.md).

## After installing

- Connect a project: run `workspace-map-mcp init` in it ([init-command.md](./init-command.md)) or copy an mcp.json recipe from [transports.md](./transports.md).
- Asset resolution is install-location independent (npx cache, global dir, `npm link`, git install, container) — if grammars ever fail to resolve, see [troubleshooting.md](./troubleshooting.md).
