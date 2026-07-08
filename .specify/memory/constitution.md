<!--
Sync Impact Report
- Version change: [template] → 1.0.0 (initial ratification)
- Principles established: I. Simplicity & YAGNI; II. Test-Backed Behavior; III. Backward-Compatible CLI & Formats; IV. Atomic, Observable Operations; V. Workspace Sovereignty
- Added sections: Additional Constraints; Development Workflow & Quality Gates
- Templates requiring updates: ✅ plan-template.md (generic gates map 1:1 to Principles I–V); ✅ spec/tasks templates unaffected
- Follow-up TODOs: none
-->

# WorkplaceWorkTree Constitution

## Core Principles

### I. Simplicity & YAGNI

No speculative layers or features. New infrastructure (CI, Docker, transports) is added only when it is the feature's deliverable, never incidentally. New runtime dependencies MUST be justified in the feature's research.md; prefer Node built-ins and existing dependencies. Complexity that survives review MUST be recorded in the plan's Complexity Tracking table.

### II. Test-Backed Behavior

Every functional requirement (FR) MUST map to at least one automated Vitest test (contract, integration, or e2e). Existing test suites MUST pass unchanged on every feature branch — prior-feature test files are a regression gate and MUST NOT be modified to make new work pass. Environment-dependent tests (e.g., Docker) MUST be skip-gated, never deleted.

### III. Backward-Compatible CLI & Formats

The stdio launch contract, published CLI flags, and generated map formats (`.codemap/structure.md`, `.codemap/relations.md`) are stable public contracts. Breaking changes require a MAJOR version bump and a documented migration path. New capabilities MUST be opt-in flags with safe defaults.

### IV. Atomic, Observable Operations

All file writes MUST be atomic (temp file + rename). Every tool invocation MUST return a structured result report (counts, durations, warnings). Errors MUST be actionable: name the offending path/flag and state the fix. Concurrent executions MUST be serialized via the process-wide mutex.

### V. Workspace Sovereignty

Outputs land only in the target workspace (`.codemap/`, `.vscode/mcp.json`, guidance files) — never in the install location. All recorded paths MUST be workspace-relative; host/container absolute paths MUST NOT leak into generated documents.

## Additional Constraints

- Language/runtime: TypeScript 5.x on Node.js ≥ 20 LTS; ESM modules.
- Distribution: npm package `@anhndh1997/workspace-map-mcp` (bin `workspace-map-mcp`); registry installs MUST NOT require a build toolchain on the consumer machine.
- Security: HTTP transport binds localhost by default; non-localhost binding is explicit opt-in and documented as trusted-network only until auth exists.

## Development Workflow & Quality Gates

- Features follow the Spec Kit flow: specify → clarify → plan → tasks → analyze → implement; `/speckit.analyze` SHOULD be run and CRITICAL findings resolved before `/speckit.implement`.
- Quality gates for every change: `npm run lint`, `npm run build`, `npm test` all green before merge.
- Constitution Check gates in plan.md MUST be evaluated before Phase 0 research and re-evaluated after Phase 1 design.

## Governance

This constitution supersedes all other practices for this repository. Amendments occur only via `/speckit.constitution`, MUST include a version bump per semantic versioning (MAJOR: principle removals/redefinitions; MINOR: new principles/sections; PATCH: clarifications), and MUST propagate to dependent templates. Compliance is verified in every plan's Constitution Check and every `/speckit.analyze` run.

**Version**: 1.0.0 | **Ratified**: 2026-07-08 | **Last Amended**: 2026-07-08
