import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AsyncMutex } from './core/mutex.js';
import {
  installGuidanceInputSchema,
  scanRelationsInputSchema,
  scanStructureInputSchema,
  updateMapsInputSchema,
} from './schemas.js';
import { runInstallGuidance } from './tools/installGuidance.js';
import { runScanRelations } from './tools/scanRelations.js';
import { runScanStructure } from './tools/scanStructure.js';
import { runUpdateMaps } from './tools/updateMaps.js';
import { SERVER_NAME, VERSION } from './version.js';
import type { ScanConfiguration, ToolResultReport } from './types.js';

export interface ServerOptions {
  workspaceRoot: string;
  maxDocLines: number;
  /**
   * Serialization mutex. HTTP mode passes one process-wide instance shared by all
   * per-request server instances (FR-009); when omitted (stdio) a fresh one is used.
   */
  mutex?: AsyncMutex;
}

const QUEUE_WARNING_THRESHOLD_MS = 25;

/**
 * MCP server wiring (T013): every tool handler runs under a process-wide mutex
 * (FR-014) and returns a uniform ToolResultReport envelope (FR-012).
 */
export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });
  const mutex = options.mutex ?? new AsyncMutex();

  const config = (extra?: Partial<ScanConfiguration>): ScanConfiguration => ({
    workspaceRoot: options.workspaceRoot,
    maxDocLines: options.maxDocLines,
    includePatterns: [],
    excludePatterns: [],
    ...extra,
  });

  const invalidInput = (tool: string, error: z.ZodError): ToolResultReport => ({
    tool,
    status: 'error',
    filesWritten: [],
    counts: {},
    durationMs: 0,
    warnings: [],
    errors: error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`),
  });

  const respond = (report: ToolResultReport, queuedMs: number) => {
    if (queuedMs > QUEUE_WARNING_THRESHOLD_MS) {
      report.warnings.push(`queued for ${queuedMs} ms behind another tool execution`);
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
      isError: report.status === 'error',
    };
  };

  server.tool(
    'scan_structure',
    'Scan the workspace and write .codemap/structure.md: a markdown folder/file tree with workspace-relative paths (partitioned per top-level folder when large).',
    {
      includePatterns: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
    },
    async (args) => {
      const parsed = scanStructureInputSchema.safeParse(args ?? {});
      if (!parsed.success) return respond(invalidInput('scan_structure', parsed.error), 0);
      const { result, queuedMs } = await mutex.runExclusive(() =>
        runScanStructure(
          config({
            includePatterns: parsed.data.includePatterns,
            excludePatterns: parsed.data.excludePatterns,
          }),
        ),
      );
      return respond(result, queuedMs);
    },
  );

  server.tool(
    'scan_relations',
    'Auto-detect languages and write .codemap/relations.md: type→file index, inheritance/interface implementations, import dependencies, and best-effort method calls.',
    {
      includePatterns: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional(),
      includeCalls: z.boolean().optional(),
    },
    async (args) => {
      const parsed = scanRelationsInputSchema.safeParse(args ?? {});
      if (!parsed.success) return respond(invalidInput('scan_relations', parsed.error), 0);
      const { result, queuedMs } = await mutex.runExclusive(() =>
        runScanRelations(
          config({
            includePatterns: parsed.data.includePatterns,
            excludePatterns: parsed.data.excludePatterns,
          }),
          parsed.data.includeCalls,
        ),
      );
      return respond(result, queuedMs);
    },
  );

  server.tool(
    'update_maps',
    'Refresh both maps to match the current workspace state (incremental via metadata diffing; full generation when maps or metadata are missing, or force=true).',
    {
      force: z.boolean().optional(),
    },
    async (args) => {
      const parsed = updateMapsInputSchema.safeParse(args ?? {});
      if (!parsed.success) return respond(invalidInput('update_maps', parsed.error), 0);
      const { result, queuedMs } = await mutex.runExclusive(() =>
        runUpdateMaps(config(), parsed.data.force),
      );
      return respond(result, queuedMs);
    },
  );

  server.tool(
    'install_guidance',
    'Install the workspace-map agent skill and a managed guidance section in copilot-instructions.md (existing content preserved; managed section replaced in place on re-run).',
    {
      copilotInstructionsPath: z.string().optional(),
    },
    async (args) => {
      const parsed = installGuidanceInputSchema.safeParse(args ?? {});
      if (!parsed.success) return respond(invalidInput('install_guidance', parsed.error), 0);
      const { result, queuedMs } = await mutex.runExclusive(() =>
        runInstallGuidance(options.workspaceRoot, parsed.data.copilotInstructionsPath),
      );
      return respond(result, queuedMs);
    },
  );

  return server;
}
