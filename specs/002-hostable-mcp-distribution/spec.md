# Feature Specification: Hostable MCP Server Distribution & Multi-Project Connection

**Feature Branch**: `002-hostable-mcp-distribution`  
**Created**: 2026-07-07  
**Status**: Draft  
**Input**: User description: "Make this MCP server hostable and connectable in another project instead of only the current project when adding to mcp.json. Support npm registry, GitHub install, Docker image, and local global install as distribution channels; support both stdio and HTTP transports; keep --workspace required; provide both a documented mcp.json recipe and a CLI init command for project setup."

## Clarifications

### Session 2026-07-07

- Q: What must the post-implementation README update include? → A: Short README quickstart + separate docs/ folder for deep guides (architecture/how it works, transports, Docker, init command); documentation update is part of this feature's definition of done.
- Q: What exact npm package name should be published (and printed in docs/init output)? → A: `@anhnguyendaenet/workspace-map-mcp` (scoped — guaranteed available); the installed command (bin) remains `workspace-map-mcp`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install From a Registry or Repository and Use Anywhere (Priority: P1)

A developer working in a completely different project (no clone of this repo) wants the workspace mapping tools. They install the package from the public npm registry (`npx workspace-map-mcp`), or directly from the GitHub repository, or as a one-time global install from a local clone. After installation, they point the server at *their* project via `--workspace` and all four tools work exactly as they do in this repo.

**Why this priority**: Distribution is the entire point of this feature — until the server is obtainable outside this repo, no other project can use it. npm/GitHub install is the lowest-friction, highest-reach channel.

**Independent Test**: From a machine location outside this repository, install the package via each channel (registry, GitHub URL, global install), launch it against a sample project, and verify the four tools generate correct maps in that project's `.codemap/`.

**Acceptance Scenarios**:

1. **Given** the package is published to the public npm registry, **When** a user runs `npx @anhnguyendaenet/workspace-map-mcp --workspace <their-project>` from any directory, **Then** the server starts without any manual build step and all four tools function.
2. **Given** a user installs via `npm install -g github:<owner>/<repo>`, **When** the install completes, **Then** the package is built automatically during installation (grammars present, compiled output present) and the global `workspace-map-mcp` command works.
3. **Given** a local clone, **When** the user runs a documented one-command global install, **Then** the command is available on PATH from any directory.
4. **Given** any install channel, **When** the server is launched against a workspace that is not this repository, **Then** generated maps land in that workspace's `.codemap/` and never in the install location.

---

### User Story 2 - Connect via HTTP Transport (Priority: P2)

A developer wants to run the server as a long-lived process (locally, in a container, or on a shared dev box) and have MCP clients connect over HTTP instead of spawning a child process. They launch the server with an HTTP flag and a port; any MCP-compatible client connects via URL. Stdio remains the default when the flag is absent.

**Why this priority**: HTTP unlocks container hosting and connection from clients that can't spawn processes, but stdio already covers the majority single-developer case — so this lands second.

**Independent Test**: Start the server with the HTTP flag against a sample workspace, connect with an MCP client over the URL, list tools, and run the full scan flow; verify stdio launch (no flag) still behaves exactly as before.

**Acceptance Scenarios**:

1. **Given** the server launched with `--http --port <n> --workspace <path>`, **When** an MCP client connects to the documented URL, **Then** it lists all four tools and can invoke them successfully.
2. **Given** no HTTP flag, **When** the server is launched as today, **Then** stdio transport is used with behavior identical to the current version (no regression).
3. **Given** an HTTP server already bound to a port, **When** a second instance targets the same port, **Then** it exits with a clear, actionable error.
4. **Given** an HTTP server running, **When** multiple clients connect concurrently and invoke tools, **Then** executions remain serialized per the existing mutex guarantees and outputs are never corrupted.
5. **Given** an HTTP server, **When** a client sends a request after the server received a shutdown signal, **Then** in-flight work completes or fails cleanly — never a half-written map.

---

### User Story 3 - Run as a Docker Container (Priority: P3)

A developer (or CI pipeline) runs the server as a Docker container. The image is published to a container registry (GHCR). The target project is bind-mounted into the container; the server runs against the mount and writes maps back to the host project. Both stdio (`docker run -i`) and HTTP (published port) modes work in the container.

**Why this priority**: Container hosting matters for isolation, CI, and teams — but it builds directly on P1 packaging and P2 HTTP, so it comes third.

**Independent Test**: Build the image locally, run it with a sample project bind-mounted in both stdio and HTTP modes, and verify maps are written to the host project with correct workspace-relative paths.

**Acceptance Scenarios**:

1. **Given** the published image, **When** run via `docker run -i` with a project mounted at `/workspace` in an mcp.json server entry, **Then** an MCP client using that entry can invoke all four tools and maps appear in the host project's `.codemap/`.
2. **Given** the image run with the HTTP flag and a published port, **When** a client connects from the host, **Then** tools work identically to a native HTTP launch.
3. **Given** the container, **When** maps are generated, **Then** all recorded paths are workspace-relative (no `/workspace` container-absolute paths leak into documents).
4. **Given** a repository tag/release, **When** CI runs, **Then** the image is built and pushed to the container registry automatically.

---

### User Story 4 - One-Command Project Setup (Priority: P4)

A developer in a new project runs a single init command (e.g., `workspace-map-mcp init`). It writes the MCP client configuration (`.vscode/mcp.json` entry) for the chosen transport, optionally runs the guidance installer (skill + copilot-instructions section), and prints next steps. A documented copy-paste mcp.json recipe exists for users who prefer manual setup.

**Why this priority**: Pure convenience layered over everything else — valuable for adoption, but manual setup already works once P1–P3 exist.

**Independent Test**: Run the init command in a fresh sample project; verify a valid mcp.json entry is created (merged, not overwriting existing servers), guidance is installed when confirmed, and an MCP client can connect using the generated config without edits.

**Acceptance Scenarios**:

1. **Given** a project without `.vscode/mcp.json`, **When** the user runs the init command, **Then** the file is created with a working server entry pointing at the current project.
2. **Given** a project with an existing `.vscode/mcp.json` containing other servers, **When** init runs, **Then** the workspace-map entry is added/updated and all other entries are preserved byte-for-byte.
3. **Given** the init command, **When** the user opts in, **Then** the guidance installer runs (skill + managed copilot-instructions section) against the target project.
4. **Given** the published documentation, **When** a user follows the quickstart in README or the channel-specific guide in docs/ (npx / global / Docker / HTTP), **Then** the copied snippet works without modification beyond path placeholders.

---

### Edge Cases

- **Install without dev toolchain**: registry installs must not require build tools on the consumer machine (prebuilt output + grammars ship in the package); GitHub installs build via the package's own scripts.
- **Grammar assets resolution**: WASM grammars must be found relative to the installed package location — regardless of global install path, npx cache, linked folder, or container path.
- **HTTP without --workspace**: launch fails with the same actionable error as stdio (workspace stays required).
- **Port conflicts / invalid ports**: clear errors, non-zero exit.
- **Container path translation**: maps must record paths relative to the mounted workspace root; host/container absolute path differences must never appear in outputs.
- **init in a project that already has the managed mcp.json entry**: entry is updated in place; never duplicated.
- **init on a non-VS Code client**: config location/format differs per client; v1 targets `.vscode/mcp.json` and documents other clients via README recipes.
- **Security surface of HTTP**: server binds to localhost by default; binding to other interfaces requires an explicit opt-in flag (documented as trusted-network only, no auth in v1).
- **Version skew**: a client config generated by an older init keeps working across patch/minor updates (stable CLI flags).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The package MUST be publishable to and installable from the public npm registry under the name `@anhnguyendaenet/workspace-map-mcp` (bin command `workspace-map-mcp`) such that `npx @anhnguyendaenet/workspace-map-mcp --workspace <path>` works on a machine that has never cloned this repository, with no manual build step.
- **FR-002**: The package MUST be installable directly from the GitHub repository (e.g., `npm install github:<owner>/<repo>`), with compiled output and grammar assets produced automatically during installation.
- **FR-003**: A documented one-command global install from a local clone MUST make the `workspace-map-mcp` command available on PATH.
- **FR-004**: Grammar assets and compiled code MUST resolve correctly relative to the installed package location for every supported install channel (registry, GitHub, global, link, npx cache, container).
- **FR-005**: The server MUST support an HTTP transport mode activated by explicit flags (`--http`, `--port <n>`), serving the same four tools with identical behavior and result reports as stdio.
- **FR-006**: Stdio MUST remain the default transport; existing launch commands and mcp.json entries MUST continue to work unchanged (backward compatibility).
- **FR-007**: In HTTP mode the server MUST bind to localhost by default; binding to any other interface MUST require an explicit opt-in flag.
- **FR-008**: `--workspace` MUST remain required in both transports, with the existing actionable error when missing or invalid.
- **FR-009**: Concurrency guarantees (serialized tool execution, atomic writes) MUST hold identically under HTTP with multiple simultaneous clients.
- **FR-010**: A Dockerfile MUST produce an image that runs the server in both stdio and HTTP modes against a bind-mounted workspace, writing maps back to the host with workspace-relative paths only.
- **FR-011**: CI MUST build and publish the Docker image to a container registry (GHCR) on release/tag, and MUST validate the npm package (build, test, pack) on push.
- **FR-012**: The CLI MUST provide an `init` subcommand that creates or updates the target project's `.vscode/mcp.json` with a working server entry (transport chosen via prompt or flags), preserving all unrelated existing content, and never duplicating its own entry on re-run.
- **FR-013**: The `init` subcommand MUST offer to run the existing guidance installer (skill + managed copilot-instructions section) against the target project.
- **FR-014**: Documentation MUST be restructured and updated as part of this feature: (a) README becomes a concise quickstart — what the tool does, fastest install, minimal mcp.json entry, link index into docs/; (b) a `docs/` folder provides deep guides covering how the maps work, every install channel (npx, global, GitHub install, Docker stdio/HTTP), both transports with copy-paste mcp.json recipes, the init command, and troubleshooting. The feature is not done until these documents reflect the implemented behavior.
- **FR-015**: The server MUST expose its version (e.g., `--version` flag) so users can verify which build any channel delivered.

### Key Entities

- **Distribution Artifact**: The installable unit per channel — npm tarball (dist + grammars + bin), GitHub-installable source (self-building), Docker image (GHCR), globally linked command; key attributes: version, included assets, build-on-install behavior.
- **Transport Configuration**: Launch-time settings — transport kind (stdio default / HTTP), port, bind interface, workspace root; validation rules and defaults.
- **Client Connection Recipe**: A documented or generated mcp.json entry per channel/transport combination; attributes: command/args or URL, placeholders, target client file.
- **Init Result**: Outcome of the init subcommand — config file created/updated, entry action (added/updated), guidance installed (yes/no), next-step instructions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean machine with only Node.js ≥ 20, `npx @anhnguyendaenet/workspace-map-mcp --workspace <sample>` produces working maps in under 3 minutes including download.
- **SC-002**: All four distribution channels (registry, GitHub install, global install, Docker) pass the same end-to-end tool-flow verification against a sample project.
- **SC-003**: An MCP client connecting over HTTP completes the full four-tool flow with results byte-equivalent (modulo timestamps/duration) to the stdio flow on the same workspace.
- **SC-004**: A user following only the README quickstart (plus linked docs/ guide for their channel) connects the server to a brand-new project in under 5 minutes via any chosen channel.
- **SC-005**: The init command produces a working client configuration on the first attempt in 100% of tested scenarios (fresh project, existing mcp.json with other servers, re-run).
- **SC-006**: Zero regressions: the entire existing test suite passes unchanged on the feature branch.

## Assumptions

- The npm package publishes as `@anhnguyendaenet/workspace-map-mcp` (scoped, public access); the executable command installed by the package remains `workspace-map-mcp`.
- npm registry publishing requires an npm account/token owned by the user; CI publishing is configured but the first publish may be manual.
- HTTP transport uses the MCP SDK's standard streamable-HTTP server transport; one server instance serves one workspace (the one given via `--workspace`) — multi-workspace routing in a single HTTP instance is out of scope for this feature.
- HTTP mode is intended for localhost/trusted networks in v1; authentication/TLS are future enhancements and are documented as such.
- Docker images target linux/amd64 (arm64 optional if CI runners allow) and are published to GHCR under the repository owner.
- The init command targets VS Code's `.vscode/mcp.json` format in v1; other clients (Claude Desktop etc.) are covered by docs/ recipes only.
- Existing feature 001 behavior (tools, maps, guidance installer) is stable and unchanged except where transport/packaging requires touching the entry point.
