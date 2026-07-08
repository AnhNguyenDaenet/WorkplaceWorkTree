# The `init` Command

One-command project setup: writes (or merges) a `workspace-map` server entry into the target project's `.vscode/mcp.json` and optionally installs the agent guidance.

```powershell
cd C:\path\to\your\project
workspace-map-mcp init --yes
```

## Flags

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `--target <dir>` | path | current directory | Project to configure; must exist |
| `--transport <t>` | `stdio` \| `http` | `stdio` | Entry variant to generate |
| `--channel <c>` | `npx` \| `global` \| `docker` | `npx` | Launch command style for stdio entries |
| `--port <n>` | 1–65535 | `3579` | Port used in the URL when `--transport http` |
| `--guidance` | boolean | prompt | Also run the guidance installer (skill + managed copilot-instructions section) |
| `--yes` | boolean | off | Non-interactive: accept defaults, skip prompts (guidance = no unless `--guidance` given) |

Exit codes: `0` success, `1` any validation/parse/write failure — **never a partial write**.

## Generated entry variants

| Invocation | Entry |
|---|---|
| `init` (defaults) | `{ "command": "npx", "args": ["@anhndh1997/workspace-map-mcp", "--workspace", "${workspaceFolder}"] }` |
| `init --channel global` | `{ "command": "workspace-map-mcp", "args": ["--workspace", "${workspaceFolder}"] }` |
| `init --channel docker` | `{ "command": "docker", "args": ["run","-i","--rm","-v","${workspaceFolder}:/workspace","ghcr.io/anhnguyendaenet/workspace-map-mcp","--workspace","/workspace"] }` |
| `init --transport http --port 4000` | `{ "url": "http://127.0.0.1:4000/mcp" }` |

## Merge behavior

`init` owns **exactly one key**: `servers["workspace-map"]`. Everything else in your mcp.json is preserved.

| Existing state | Result |
|---|---|
| No `.vscode/mcp.json` | File created with the entry (`fileAction: created`) |
| Valid JSON, no `workspace-map` entry | Entry added; all sibling servers/keys preserved (`entryAction: added`) |
| Valid JSON, entry present | Entry replaced in place — never duplicated (`entryAction: updated`) |
| Invalid JSON / JSONC | **Abort, exit 1, file untouched** |

Writes are atomic (temp file + rename).

> **JSONC limitation**: VS Code tolerates comments and trailing commas in mcp.json, but `init` parses strict JSON only. If your file uses JSONC syntax, `init` aborts with an actionable error and leaves the file untouched — remove the comments or add the entry manually from [transports.md](./transports.md).

## Examples

```powershell
# Fresh project, npx entry, install guidance, no prompts
workspace-map-mcp init --guidance --yes

# Configure a different project directory
workspace-map-mcp init --target C:\src\other-project --yes

# Global-command entry instead of npx
workspace-map-mcp init --channel global --yes

# Docker-stdio entry
workspace-map-mcp init --channel docker --yes

# HTTP entry pointing at a long-running server on port 4000
workspace-map-mcp init --transport http --port 4000 --yes
```

The command prints a structured result — target, config file, file/entry action, transport, channel, guidance status — plus next steps (reload the client, run `scan_structure`).
