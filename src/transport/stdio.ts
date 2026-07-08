import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { TransportConfiguration } from '../cli/args.js';
import { SERVER_NAME, VERSION } from '../version.js';

/**
 * Stdio transport (T003): the exact connect + ready-log behavior of v0.1.0
 * src/index.ts, extracted unchanged (FR-006 byte-identical guarantee).
 */
export async function startStdio(server: McpServer, config: TransportConfiguration): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${VERSION} ready — workspace: ${config.workspaceInput}`);
}
