import { z } from 'zod';

/**
 * Strict tool input schemas + report schema (contracts/mcp-tools.md).
 * `.strict()` rejects unknown properties; contract tests validate against these directly.
 */

export const scanStructureInputSchema = z
  .object({
    includePatterns: z.array(z.string()).default([]),
    excludePatterns: z.array(z.string()).default([]),
  })
  .strict();

export const scanRelationsInputSchema = z
  .object({
    includePatterns: z.array(z.string()).default([]),
    excludePatterns: z.array(z.string()).default([]),
    includeCalls: z.boolean().default(true),
  })
  .strict();

export const updateMapsInputSchema = z
  .object({
    force: z.boolean().default(false),
  })
  .strict();

export const installGuidanceInputSchema = z
  .object({
    copilotInstructionsPath: z.string().default('.github/copilot-instructions.md'),
  })
  .strict();

export const toolResultReportSchema = z.object({
  tool: z.string(),
  status: z.enum(['success', 'partial', 'error']),
  filesWritten: z.array(z.string()),
  counts: z.record(z.union([z.number(), z.string()])),
  durationMs: z.number(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export type ScanStructureInput = z.infer<typeof scanStructureInputSchema>;
export type ScanRelationsInput = z.infer<typeof scanRelationsInputSchema>;
export type UpdateMapsInput = z.infer<typeof updateMapsInputSchema>;
export type InstallGuidanceInput = z.infer<typeof installGuidanceInputSchema>;
