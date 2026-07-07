# Contract: MCP Tool Interfaces

**Feature**: 001-workspace-map-mcp | **Date**: 2026-07-07
**Protocol**: Model Context Protocol (MCP), stdio transport. All tools are registered on server `workspace-map-mcp`. Input schemas are enforced with zod; violations return MCP errors without side effects. All tool executions are serialized server-side (FR-014); a queued call waits and completes normally.

## Server launch contract

```text
npx workspace-map-mcp --workspace <absolute-path> [--max-doc-lines <n>]
```

- `--workspace` (required): absolute path to the workspace root to map. Invalid/missing → process exits non-zero with actionable message on stderr.
- The server never touches files outside `<workspace>/.codemap/`, `<workspace>/.github/skills/workspace-map/`, and `<workspace>/.github/copilot-instructions.md`.

## Tool 1: `scan_structure`

Generates `.codemap/structure.md` (+ `structure/*.md` partitions when large). Implements FR-001, FR-002, FR-007, FR-008, FR-014, FR-015.

**Input schema**:

```json
{
  "type": "object",
  "properties": {
    "includePatterns": { "type": "array", "items": { "type": "string" }, "default": [] },
    "excludePatterns": { "type": "array", "items": { "type": "string" }, "default": [] }
  },
  "additionalProperties": false
}
```

**Output** (MCP text content, JSON `ToolResultReport`):

```json
{
  "tool": "scan_structure",
  "status": "success | partial | error",
  "filesWritten": [".codemap/structure.md"],
  "counts": { "folders": 0, "files": 0, "partitions": 0 },
  "durationMs": 0,
  "warnings": [],
  "errors": []
}
```

**Error cases**: unreadable root → `status: "error"`, `filesWritten: []` (no partial output, US1-AS4).

## Tool 2: `scan_relations`

Generates `.codemap/relations.md` (+ `relations/*.md` partitions). Implements FR-003, FR-004, FR-008, FR-011, FR-013, FR-014, FR-015.

**Input schema**:

```json
{
  "type": "object",
  "properties": {
    "includePatterns": { "type": "array", "items": { "type": "string" }, "default": [] },
    "excludePatterns": { "type": "array", "items": { "type": "string" }, "default": [] },
    "includeCalls": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
}
```

**Output**:

```json
{
  "tool": "scan_relations",
  "status": "success | partial | error",
  "filesWritten": [".codemap/relations.md"],
  "counts": { "types": 0, "relations": 0, "fileDependencies": 0, "reducedAnalysisFiles": 0, "partitions": 0 },
  "durationMs": 0,
  "warnings": ["<n> files received reduced analysis"],
  "errors": []
}
```

**Behavioral guarantees**: unparseable files never abort the scan (`status: "partial"` + warning); docs-only workspace → success with `types: 0` and an explanatory note in the document.

## Tool 3: `update_maps`

Refreshes both maps incrementally; full generation when maps/metadata missing or invalid. Implements FR-005, FR-012, FR-014.

**Input schema**:

```json
{
  "type": "object",
  "properties": {
    "force": { "type": "boolean", "default": false, "description": "Skip diffing and regenerate everything" }
  },
  "additionalProperties": false
}
```

**Output**:

```json
{
  "tool": "update_maps",
  "status": "success | partial | error",
  "filesWritten": [".codemap/structure.md", ".codemap/relations.md", ".codemap/meta.json"],
  "counts": { "added": 0, "changed": 0, "removed": 0, "mode": "incremental | full" },
  "durationMs": 0,
  "warnings": [],
  "errors": []
}
```

**Behavioral guarantees**: zero stale paths after rename/delete (US3-AS2); concurrent second call queues behind the mutex and reports a `"queued for <n> ms"` warning.

## Tool 4: `install_guidance`

Installs the agent skill and managed copilot-instructions section. Implements FR-009, FR-010.

**Input schema**:

```json
{
  "type": "object",
  "properties": {
    "copilotInstructionsPath": {
      "type": "string",
      "default": ".github/copilot-instructions.md",
      "description": "Workspace-relative path to the instructions file"
    }
  },
  "additionalProperties": false
}
```

**Output**:

```json
{
  "tool": "install_guidance",
  "status": "success | error",
  "filesWritten": [".github/skills/workspace-map/SKILL.md", ".github/copilot-instructions.md"],
  "counts": { "sectionAction": "created-file | appended | replaced" },
  "durationMs": 0,
  "warnings": [],
  "errors": []
}
```

**Behavioral guarantees**: content outside the managed markers is preserved byte-for-byte; duplicate marker pairs → `status: "error"` with remediation message, file untouched.

## Cross-cutting contract rules

1. Every tool returns a `ToolResultReport` — never a bare string (FR-012).
2. All written paths in reports are workspace-relative with `/` separators (FR-004).
3. No tool starts writing before validation passes; all writes are temp+rename atomic (FR-014).
4. Reports are stable-ordered (deterministic arrays) so clients can snapshot-test against them.
