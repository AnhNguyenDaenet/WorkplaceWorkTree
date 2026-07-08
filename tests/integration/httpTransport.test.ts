import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  copyFixtureNamed,
  freePort,
  readDoc,
  repoRoot,
  rmrf,
  spawnServer,
  waitForReady,
  type SpawnedServer,
} from '../helpers.js';
import type { ToolResultReport } from '../../src/types.js';

/**
 * HTTP transport e2e (T017, US2-AS1, SC-003): the full four-tool flow over
 * Streamable HTTP, then the same flow over stdio on an identical fixture copy,
 * asserting result parity modulo timestamp/duration values.
 */

/** Strip run-variant values: generation timestamps and durations. */
function normalizeDoc(doc: string): string {
  return doc.replace(/ on \d{4}-\d{2}-\d{2}T[0-9:.]+Z?/g, ' on <ts>');
}

function normalizeReport(report: ToolResultReport): unknown {
  const { durationMs, ...rest } = report;
  void durationMs;
  return { ...rest, warnings: rest.warnings.filter((w) => !w.includes('queued for')) };
}

async function runFourToolFlow(client: Client): Promise<Record<string, ToolResultReport>> {
  const reports: Record<string, ToolResultReport> = {};
  for (const tool of ['scan_structure', 'scan_relations', 'install_guidance', 'update_maps']) {
    const result = await client.callTool({ name: tool, arguments: {} });
    reports[tool] = JSON.parse((result.content as Array<{ text: string }>)[0].text) as ToolResultReport;
  }
  return reports;
}

describe('HTTP transport e2e (US2-AS1, SC-003)', () => {
  let httpWorkspace: string;
  let stdioWorkspace: string;
  let httpServer: SpawnedServer;
  let httpClient: Client;
  let stdioClient: Client;
  let port: number;

  beforeAll(async () => {
    // Same root folder name in both copies so generated docs are byte-comparable.
    httpWorkspace = await copyFixtureNamed('multi-lang', 'parity-ws', 'wmap-http-');
    stdioWorkspace = await copyFixtureNamed('multi-lang', 'parity-ws', 'wmap-http-parity-');
    port = await freePort();

    httpServer = spawnServer(['--workspace', httpWorkspace, '--http', '--port', String(port)]);
    await waitForReady(httpServer);

    httpClient = new Client({ name: 'http-e2e', version: '0.0.0' });
    await httpClient.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
    );

    stdioClient = new Client({ name: 'stdio-parity', version: '0.0.0' });
    await stdioClient.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', 'src/index.ts', '--workspace', stdioWorkspace],
        cwd: repoRoot,
        stderr: 'ignore',
      }),
    );
  }, 90000);

  afterAll(async () => {
    await httpClient?.close().catch(() => {});
    await stdioClient?.close().catch(() => {});
    httpServer?.kill('SIGKILL');
    if (httpWorkspace) await rmrf(path.dirname(httpWorkspace));
    if (stdioWorkspace) await rmrf(path.dirname(stdioWorkspace));
  });

  it('startup log states transport, bind address, and workspace (FR-007 visibility)', () => {
    const log = httpServer.stderrText();
    expect(log).toContain('transport: http');
    expect(log).toContain(`url: http://127.0.0.1:${port}/mcp`);
    expect(log).toContain(`workspace: ${httpWorkspace}`);
  });

  it('lists all four tools over HTTP', async () => {
    const { tools } = await httpClient.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'install_guidance',
      'scan_relations',
      'scan_structure',
      'update_maps',
    ]);
  });

  it('runs the full four-tool flow over HTTP with results matching stdio modulo timestamps (SC-003)', async () => {
    const httpReports = await runFourToolFlow(httpClient);
    const stdioReports = await runFourToolFlow(stdioClient);

    for (const tool of Object.keys(httpReports)) {
      expect(normalizeReport(httpReports[tool]), tool).toEqual(normalizeReport(stdioReports[tool]));
      expect(['success', 'partial']).toContain(httpReports[tool].status);
    }

    for (const rel of ['.codemap/structure.md', '.codemap/relations.md']) {
      const a = normalizeDoc(await readDoc(httpWorkspace, rel));
      const b = normalizeDoc(await readDoc(stdioWorkspace, rel));
      expect(a, rel).toBe(b);
    }

    const skill = '.github/skills/workspace-map/SKILL.md';
    expect(await readDoc(httpWorkspace, skill)).toBe(await readDoc(stdioWorkspace, skill));
  }, 60000);

  it('returns 404 for non-/mcp paths', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/other`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('/mcp');
  });
});
