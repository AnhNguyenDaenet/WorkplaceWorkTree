# Contract: Packaging, Image & CI

**Feature**: 002-hostable-mcp-distribution | **Date**: 2026-07-07

## npm package (FR-001/FR-002/FR-003, R1/R2)

**Identity**:

```json
{
  "name": "@anhndh1997/workspace-map-mcp",
  "bin": { "workspace-map-mcp": "dist/index.js" },
  "publishConfig": { "access": "public" },
  "files": ["dist", "assets/grammars", "README.md"]
}
```

**Lifecycle scripts contract**:

| Script | Trigger | Must |
|---|---|---|
| `prepublishOnly` | `npm publish` | Fetch grammars + full `tsc` build — tarball always ships fresh `dist/` + 8 `.wasm` grammars |
| `prepare` | git installs, local `npm install`, `npm link` | Grammars soft-fetch + build-if-needed; never fails when a usable `dist/` exists; produces working `dist/` on clean git install (devDeps present per npm git-dependency behavior) |
| `postinstall` | — | MUST NOT exist (registry consumers must not build — FR-001) |

**Tarball acceptance** (pack-smoke test): install packed tarball into an empty temp project → `node_modules/.bin/workspace-map-mcp --version` works → serve against a fixture workspace → `scan_structure` succeeds and grammars resolve (FR-004).

## Asset resolution (FR-004, R6)

`dist/core/assets.js` resolves `assets/grammars/` relative to `import.meta.url` (package-root anchored), independent of CWD for: registry install, npx cache, global install, `npm link`, git install, Docker (`/app`). Existence-checked with actionable error naming the expected directory.

## Docker image (FR-010, R7)

**Image**: `ghcr.io/anhnguyendaenet/workspace-map-mcp:<version>` and `:latest`.

**Dockerfile contract**:

- Base `node:20-slim`; non-root `USER node`; workdir `/app`.
- Contents: `package.json`, prebuilt `dist/`, `assets/grammars/`, production deps via `npm ci --omit=dev --ignore-scripts`.
- `ENTRYPOINT ["node", "dist/index.js"]` — all server flags passed as run args.

**Run recipes (documented in docs/docker.md, tested by Docker smoke)**:

```text
# stdio (per-project, from mcp.json)
docker run -i --rm -v <project>:/workspace ghcr.io/anhnguyendaenet/workspace-map-mcp --workspace /workspace

# HTTP (long-running)
docker run -d --rm -v <project>:/workspace -p 3579:3579 ghcr.io/anhnguyendaenet/workspace-map-mcp \
  --workspace /workspace --http --port 3579 --host 0.0.0.0
```

**Guarantees**: maps written to the bind mount contain workspace-relative paths only — the string `/workspace` never appears in generated documents (US3-AS3); container HTTP exposure is controlled solely by `-p` publishing (FR-007 rationale documented).

## CI workflows (FR-011, R8)

### `.github/workflows/ci.yml`

| Aspect | Contract |
|---|---|
| Triggers | push + pull_request on `main` and `[0-9][0-9][0-9]-*` branches |
| Steps | checkout → setup-node 20 (npm cache) → `npm ci` → `npm run lint` → `npm run build` → `npm test` → `npm pack` → upload tarball artifact |
| Gate | Any step failure fails the workflow; pack-smoke runs inside `npm test` |

### `.github/workflows/release.yml`

| Aspect | Contract |
|---|---|
| Trigger | tag push matching `v*` |
| Permissions | `contents: read`, `packages: write` |
| Docker job | build prebuilt context → login GHCR with `GITHUB_TOKEN` → push `:<version>` + `:latest` |
| npm job | `npm publish --access public` gated: skipped (not failed) when `NPM_TOKEN` secret is absent — first publish may be manual (spec assumption) |
| Version source | Tag `vX.Y.Z` must equal package.json version; mismatch fails the workflow |

## Documentation set (FR-014, R9)

| File | Required content |
|---|---|
| `README.md` | ≤ ~80 lines: what it is, npx quickstart + minimal mcp.json, tool table, links into docs/ |
| `docs/how-it-works.md` | Maps explained, reading order, tools, architecture sketch |
| `docs/install.md` | All 4 channels with copy-paste commands + `--version` verification |
| `docs/transports.md` | stdio & HTTP recipes (VS Code + Claude Desktop), localhost/security notes |
| `docs/docker.md` | Both run modes, bind-mount rules, GHCR tags |
| `docs/init-command.md` | Flags, merge behavior, examples, JSONC limitation |
| `docs/troubleshooting.md` | Expanded from current README section |

**Acceptance**: every snippet uses the scoped package name; a reviewer following README+relevant guide connects a fresh project in < 5 min (SC-004).
