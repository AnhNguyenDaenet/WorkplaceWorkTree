# Feature Specification: Workspace Mapping Tools (MCP Server)

**Feature Branch**: `001-workspace-map-mcp`  
**Created**: 2026-07-07  
**Status**: Draft  
**Input**: User description: "Create tools: (1) scan the whole workspace and document folder/file trees as a markdown file so AI can read it to get relative file paths; (2) generate file/class relation mappings so AI can navigate directly to the correct file instead of searching; (3) update those two files when structure or relations change. Add an agent skill that invokes these tools, and add guidance to copilot-instructions.md on how to use the files and where they are. Host everything as an MCP server that can be connected to and used."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Workspace Structure Map (Priority: P1)

A developer (or their AI assistant) connected to the tool server requests a workspace scan. The tool walks the entire workspace from its root, skips irrelevant folders (dependencies, build output, version-control metadata), and writes a markdown document that presents the complete folder and file tree with workspace-relative paths. From then on, any AI assistant can read this single document to resolve the relative path of any file instantly, instead of performing repeated directory listings or searches.

**Why this priority**: This is the foundational artifact — without an accurate structure map, neither the relation map nor the AI guidance has value. It alone already delivers the core benefit: AI assistants stop wasting time and tool calls exploring the file tree.

**Independent Test**: Can be fully tested by connecting a compatible client to the server, invoking the structure-scan tool on a sample workspace, and verifying that the generated markdown file lists every non-excluded folder and file with correct workspace-relative paths.

**Acceptance Scenarios**:

1. **Given** a workspace with nested folders and files and a connected client, **When** the structure-scan tool is invoked, **Then** a markdown document is created in the dedicated map folder showing every folder and file as a tree, with workspace-relative paths derivable for each entry.
2. **Given** a workspace containing dependency, build-output, and version-control folders (e.g., package caches, compiled output), **When** the scan runs, **Then** those folders are excluded by default and the applied exclusion rules are listed in the document header.
3. **Given** a structure map already exists, **When** the scan tool is invoked again, **Then** the document is regenerated to reflect the current state and its generation timestamp is updated.
4. **Given** an empty or invalid workspace root, **When** the scan is invoked, **Then** the tool returns a clear, actionable error message and writes no partial output.

---

### User Story 2 - Generate Code Relation Map (Priority: P2)

A developer (or their AI assistant) requests a relation scan. The tool auto-detects the programming languages present in the workspace and produces a mapping document that records: where each class/type is defined (type → file path), inheritance and interface implementations, import/using dependencies between files, and method call/reference relationships. An AI assistant reading this document can jump directly to the correct file for any type or follow relationships between files without searching.

**Why this priority**: This is the main navigation accelerator — it turns "search the whole codebase for class X" into a single lookup. It depends conceptually on the structure map's path conventions, so it comes second.

**Independent Test**: Can be tested by running the relation-scan tool on a sample workspace containing classes with inheritance and cross-file imports, then verifying the generated document correctly maps each type to its defining file and lists its relationships.

**Acceptance Scenarios**:

1. **Given** source files defining classes/types (some inheriting from others or implementing interfaces), **When** the relation-scan tool is invoked, **Then** the generated document lists each type with its workspace-relative defining file path, its parent types, and implemented interfaces.
2. **Given** a file that imports or references another file in the workspace, **When** the scan runs, **Then** that dependency is recorded in the mapping.
3. **Given** a method defined in one class and called from another, **When** the scan runs, **Then** the call/reference relationship is recorded (best-effort, depending on language support).
4. **Given** files in a language the tool cannot deeply analyze, **When** the scan runs, **Then** those files still appear with any detectable file-level imports, and the document notes which files received reduced analysis.
5. **Given** two types with identical names in different locations, **When** the scan runs, **Then** each entry is disambiguated (e.g., by namespace/module and file path) so an AI can pick the correct one.

---

### User Story 3 - Update Maps On Demand (Priority: P3)

After the workspace changes (files added, deleted, renamed, or code relations changed), the developer or AI assistant invokes the update tool. It refreshes both documents so they match the current workspace state, removing stale entries and adding new ones. If the maps do not exist yet, the update performs a full generation.

**Why this priority**: Maps that drift out of date actively mislead AI assistants — worse than no maps. On-demand refresh keeps the artifacts trustworthy while staying simple and predictable (no background processes).

**Independent Test**: Can be tested by generating both maps, making file additions/deletions/renames, invoking the update tool, and verifying both documents reflect exactly the new state with no stale entries.

**Acceptance Scenarios**:

1. **Given** generated maps and a newly added source file, **When** the update tool is invoked, **Then** the structure map includes the new file and the relation map includes its types and relationships.
2. **Given** a deleted or renamed file, **When** the update tool is invoked, **Then** all entries pointing to the old path are removed or updated — no stale paths remain in either document.
3. **Given** no existing map documents, **When** the update tool is invoked, **Then** a full generation of both documents runs and succeeds.
4. **Given** an update is already running, **When** a second update is requested concurrently, **Then** the outputs are not corrupted (requests are serialized or the second is safely rejected with a clear message).

---

### User Story 4 - Agent Skill and Copilot Instructions Guidance (Priority: P4)

A developer sets up the accompanying agent skill. The skill teaches AI assistants when and how to invoke the mapping tools and how to consume the generated documents. Setup also adds a clearly marked guidance section to the workspace's copilot-instructions.md describing where the map files live and how to use them (read the structure map to resolve paths, read the relation map to navigate to types, invoke the update tool when the maps look stale). Existing user content in copilot-instructions.md is preserved.

**Why this priority**: This closes the loop — the maps only pay off if AI assistants reliably know to use them. It depends on all three tools existing, so it comes last.

**Independent Test**: Can be tested by running the skill/guidance setup in a workspace with an existing copilot-instructions.md and verifying a marked guidance section is added without altering existing content, then confirming an AI assistant following the instructions reads the maps instead of scanning the workspace.

**Acceptance Scenarios**:

1. **Given** a workspace with an existing copilot-instructions.md, **When** guidance setup runs, **Then** a clearly delimited guidance section is appended/merged and all pre-existing content remains unchanged.
2. **Given** a workspace without copilot-instructions.md, **When** guidance setup runs, **Then** the file is created containing the guidance section.
3. **Given** the skill is installed and maps exist, **When** a user asks their AI assistant to find or navigate to a file/class, **Then** the assistant consults the map documents rather than performing workspace-wide searches.
4. **Given** guidance was installed previously, **When** setup runs again, **Then** the managed guidance section is replaced in place (no duplicate sections).

---

### Edge Cases

- **Very large workspaces** (tens of thousands of files): documents must remain consumable by AI assistants — content is organized so a reader can load only the relevant portion (e.g., split by top-level folder) when a single document would become unreasonably large.
- **Symbolic links / folder junctions** that create cycles: the scanner must detect and not loop infinitely; linked locations are recorded once.
- **Identically named types** in different namespaces/modules: entries must be qualified so they remain unambiguous.
- **Files that fail to parse** (syntax errors, exotic encodings): they still appear in the structure map; the relation map notes them as skipped rather than failing the whole scan.
- **Workspaces with no source code** (docs-only): structure map generates normally; relation map states that no analyzable code was found.
- **The map folder itself**: excluded from scanning so the maps never describe themselves recursively.
- **Ignore rules**: workspace ignore rules (e.g., .gitignore) are honored in addition to built-in default exclusions.
- **Interrupted generation** (crash/cancel mid-write): previously valid maps are not left half-overwritten; generation writes atomically (complete or not at all).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a workspace-scan tool that walks all folders and files from a given workspace root and produces a markdown document representing the full hierarchy, from which the workspace-relative path of every included file can be read.
- **FR-002**: System MUST exclude version-control metadata, dependency folders, build outputs, and the map output folder by default; MUST honor workspace ignore rules; and MUST allow users to configure additional include/exclude patterns. Applied exclusions MUST be listed in the generated document.
- **FR-003**: System MUST provide a relation-scan tool that auto-detects the major programming languages present and records: (a) each class/type mapped to its defining file, (b) inheritance and interface-implementation relationships, (c) import/using dependencies between files, and (d) method call/reference relationships on a best-effort basis per language.
- **FR-004**: All file references in the relation map MUST use workspace-relative paths consistent with the structure map.
- **FR-005**: System MUST provide an on-demand update tool that refreshes both documents to match the current workspace state, removing stale entries; when maps are missing, it MUST fall back to full generation. No background watching or automatic triggering is included.
- **FR-006**: All three tools MUST be exposed through the Model Context Protocol (MCP) so that any MCP-compatible AI client can connect to the server and invoke them.
- **FR-007**: Generated documents MUST be stored in a single dedicated folder at the workspace root with stable, predictable file names so AI assistants and instructions can reference them reliably.
- **FR-008**: Each generated document MUST include metadata: generation timestamp, workspace root name, summary counts (folders, files, types/relations), and the exclusion rules applied.
- **FR-009**: System MUST include an agent skill that instructs AI assistants when to invoke each tool and how to consume the generated documents.
- **FR-010**: System MUST provide a setup step that adds a clearly delimited, managed guidance section to copilot-instructions.md (creating the file if absent, preserving all existing content, and replacing only its own section on re-run) describing where the maps are and how to use them.
- **FR-011**: The relation scan MUST degrade gracefully: unsupported languages or unparseable files reduce analysis depth for those files only, are reported in the document, and never abort the overall scan.
- **FR-012**: Every tool invocation MUST return a clear result report: what was written, summary counts, duration, and any warnings or errors.
- **FR-013**: Identically named types MUST be disambiguated in the relation map (e.g., by namespace/module qualification plus file path).
- **FR-014**: Concurrent tool invocations MUST NOT corrupt outputs; generation MUST be atomic so an interrupted run never leaves a previously valid map half-overwritten.
- **FR-015**: Generated documents MUST remain consumable by AI assistants as workspaces grow: when a single document would exceed a practical readable size, content MUST be organized into predictable, linked partitions (e.g., per top-level folder).

### Key Entities

- **Workspace Structure Map**: Markdown document representing the folder/file tree of the workspace; key attributes: generation timestamp, workspace root, exclusion rules applied, folder/file counts, hierarchical entries with relative paths.
- **Code Relation Map**: Markdown document recording type-to-file locations, inheritance/interface implementations, import dependencies, and method call/reference relationships; key attributes: language coverage summary, per-type entries (qualified name, defining file, relations), reduced-analysis file list.
- **Scan Configuration**: User-adjustable settings for a scan: workspace root, extra include/exclude patterns; defaults applied when unspecified.
- **Tool Result Report**: Outcome returned by each tool invocation: files written, counts, duration, warnings, errors.
- **Agent Guidance**: The skill content and the managed copilot-instructions.md section that tell AI assistants where the maps live and how to use them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a structure scan, 100% of non-excluded workspace files appear in the structure map, and an AI assistant can state the correct relative path of any named file by reading the map alone.
- **SC-002**: Using the relation map, an AI assistant navigates to the defining file of a requested class/type on the first attempt in at least 95% of lookups.
- **SC-003**: A full scan of a workspace with 10,000 files completes in under 60 seconds on typical developer hardware.
- **SC-004**: An on-demand update after up to 100 changed files completes in under 15 seconds and leaves zero stale entries in either document.
- **SC-005**: A new user can connect a compatible AI client to the server and produce both maps in under 5 minutes by following the documented setup steps.
- **SC-006**: With maps and guidance installed, AI assistants complete comparable file-navigation tasks using at least 50% fewer search/listing operations than without the maps.

## Assumptions

- A single workspace root is mapped per server session; multi-root workspaces are out of scope for the first version.
- Both generated documents use markdown, chosen for combined human and AI readability (the structure map was explicitly requested as markdown; the relation map follows the same format for consistency).
- Updates are strictly on-demand (explicitly chosen); file watchers, git hooks, and background refresh are out of scope for the first version.
- Language support targets automatic detection of the major mainstream languages; depth of method call/reference analysis may vary by language and is best-effort, while type-to-file mapping, inheritance, and import relations are the accuracy priority.
- Default exclusions cover version-control metadata, dependency directories, build outputs, and the map folder itself; workspace ignore rules are honored on top.
- The dedicated map folder lives at the workspace root (working name such as `.codemap/`; final name decided during planning); committing it to version control is a team choice, not enforced.
- "Hosted as an MCP server" means the server runs alongside the workspace and accepts connections from any MCP-compatible client; shared/remote hosting for teams is a possible future enhancement, not a first-version requirement.
- The copilot-instructions.md guidance is written inside clearly marked managed boundaries so future re-runs can update only that section.
