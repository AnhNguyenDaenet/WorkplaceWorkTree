# Contract: CLI Surface

**Feature**: 002-hostable-mcp-distribution | **Date**: 2026-07-07
**Stability**: These flags/subcommands are the public interface referenced by docs/ and generated configs; changes require a version bump and docs update (spec edge case: version skew).

## Invocation forms

```text
workspace-map-mcp --workspace <abs-path> [--max-doc-lines <n>]                     # serve, stdio (DEFAULT — unchanged from v0.1.0)
workspace-map-mcp --workspace <abs-path> --http --port <n> [--host <addr>]        # serve, HTTP
workspace-map-mcp init [options]                                                   # project setup
workspace-map-mcp --version | -v                                                   # print version, exit 0
```

## Serve mode flags

| Flag | Type | Required | Default | Behavior |
|---|---|---|---|---|
| `--workspace` | abs path | yes | — | Unchanged validation + error text (FR-006/FR-008): missing → usage + exit 1; relative → error; nonexistent/not-dir/unreadable → actionable error |
| `--max-doc-lines` | int > 100 | no | 1500 | Unchanged |
| `--http` | boolean | no | off | Enables HTTP transport; stdio when absent (FR-005/FR-006) |
| `--port` | int 1–65535 | with `--http` | — | Missing with `--http` → "--port is required with --http"; EADDRINUSE → "port <n> is already in use…" + exit 1 (US2-AS3) |
| `--host` | string | no | `127.0.0.1` | Values other than loopback are an explicit opt-in (FR-007); startup log states bind address |

**HTTP endpoint**: `POST/GET/DELETE http://<host>:<port>/mcp` (MCP Streamable HTTP, stateless mode). Non-`/mcp` paths → 404. Shutdown on SIGINT/SIGTERM: stop accepting, drain in-flight mutex queue, exit 0 (US2-AS5).

**Concurrency guarantee**: identical `ToolResultReport` envelope and serialized execution as stdio; concurrent clients queue behind the process mutex with the existing "queued for <n> ms" warning (FR-009).

## `init` subcommand

| Flag | Type | Default | Behavior |
|---|---|---|---|
| `--target <dir>` | path | cwd | Project to configure; must exist |
| `--transport <t>` | `stdio` \| `http` | `stdio` | Chooses entry variant |
| `--channel <c>` | `npx` \| `global` \| `docker` | `npx` | Launch command style for stdio entries |
| `--port <n>` | int | 3579 | Used when `--transport http` (entry URL) |
| `--guidance` | boolean | prompt (assume no with `--yes`) | Run feature-001 guidance installer against target (FR-013) |
| `--yes` | boolean | off | Non-interactive: accept defaults, skip prompts |

**Contract (FR-012, data-model §4)**:

1. Reads `<target>/.vscode/mcp.json`; strict JSON parse; parse failure → exit 1, actionable message, file untouched.
2. Owns exactly `servers["workspace-map"]`; every other byte of parsed structure is preserved on rewrite; re-run updates the owned entry only — never duplicates.
3. Writes atomically (temp + rename).
4. Prints InitResult (data-model §5) and exits 0.

**Exit codes**: 0 success; 1 validation/parse/write failure — no partial writes ever.

## `--version` (FR-015)

Prints the package version string (e.g., `0.2.0`) to stdout, exit 0. Available in every channel; docs instruct users to verify installs with it.

## Backward-compatibility guarantee (FR-006)

Every v0.1.0 invocation (`workspace-map-mcp --workspace <p> [--max-doc-lines n]`) behaves identically: same transport (stdio), same validation messages, same tool registrations, same outputs. Covered by the unchanged feature-001 e2e suite (SC-006).
