import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { copyFixture, freePort, readDoc, repoRoot, rmrf, sleep } from '../helpers.js';

/**
 * Docker smoke test (T021, US3-AS1/AS2/AS3, FR-010) — runs only when a Docker
 * daemon is reachable (research R10); CI's ubuntu runner exercises it.
 */

const IMAGE = 'workspace-map-mcp:smoke';

function docker(args: string[], timeoutMs = 120000): { status: number; out: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs, cwd: repoRoot });
  return { status: result.status ?? 1, out: `${result.stdout}\n${result.stderr}` };
}

const dockerAvailable = (() => {
  try {
    return docker(['version', '--format', 'ok'], 15000).status === 0;
  } catch {
    return false;
  }
})();

/** Match container-user to the host uid on Linux so the bind mount is writable. */
function userArgs(): string[] {
  const getuid = (process as NodeJS.Process & { getuid?: () => number }).getuid;
  const getgid = (process as NodeJS.Process & { getgid?: () => number }).getgid;
  return getuid && getgid ? ['--user', `${getuid()}:${getgid()}`] : [];
}

describe.runIf(dockerAvailable)('docker smoke (US3)', () => {
  let workspace: string;

  beforeAll(async () => {
    // Prebuilt-context contract: dist/ must exist before docker build (research R7).
    const build = spawnSync(process.execPath, ['scripts/build-if-needed.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(build.status).toBe(0);
    const image = docker(['build', '-t', IMAGE, '.'], 600000);
    expect(image.status, image.out).toBe(0);
    workspace = await copyFixture('multi-lang', 'wmap-docker-');
  }, 660000);

  afterAll(async () => {
    if (workspace) await rmrf(workspace);
  });

  it('stdio mode: maps written to the host with workspace-relative paths only (US3-AS1/AS3)', async () => {
    const client = new Client({ name: 'docker-smoke', version: '0.0.0' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: 'docker',
          args: [
            'run', '-i', '--rm', ...userArgs(),
            '-v', `${workspace}:/workspace`,
            IMAGE, '--workspace', '/workspace',
          ],
          stderr: 'ignore',
        }),
      );
      for (const tool of ['scan_structure', 'scan_relations']) {
        const result = await client.callTool({ name: tool, arguments: {} });
        const report = JSON.parse((result.content as Array<{ text: string }>)[0].text) as {
          status: string;
        };
        expect(['success', 'partial'], tool).toContain(report.status);
      }
    } finally {
      await client.close().catch(() => {});
    }

    // Maps landed on the host…
    const structure = await readDoc(workspace, '.codemap/structure.md');
    expect(structure).toContain('# src/web/app.ts');
    // …and no container-absolute path leaked into any generated doc (US3-AS3).
    const codemapDir = path.join(workspace, '.codemap');
    for (const file of await fs.readdir(codemapDir)) {
      if (!file.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(codemapDir, file), 'utf8');
      expect(content.includes('/workspace'), `${file} leaks /workspace`).toBe(false);
    }
  }, 180000);

  it('HTTP mode: published port serves the same four tools (US3-AS2)', async () => {
    const port = await freePort();
    const run = docker([
      'run', '-d', '--rm', ...userArgs(),
      '-v', `${workspace}:/workspace`,
      '-p', `${port}:${port}`,
      IMAGE,
      '--workspace', '/workspace', '--http', '--port', String(port), '--host', '0.0.0.0',
    ]);
    expect(run.status, run.out).toBe(0);
    const containerId = run.out.trim().split('\n')[0];

    try {
      // Docker's userland proxy accepts TCP before the app binds — poll with a
      // cheap HTTP request until our handler answers, then connect the MCP client.
      const deadline = Date.now() + 60000;
      for (;;) {
        try {
          const probe = await fetch(`http://127.0.0.1:${port}/healthz-probe`, {
            signal: AbortSignal.timeout(2000),
          });
          if (probe.status === 404) break; // our 404 handler ⇒ server is up
        } catch {
          // not up yet
        }
        if (Date.now() > deadline) throw new Error('container HTTP endpoint never became ready');
        await sleep(500);
      }

      const client = new Client({ name: 'docker-http', version: '0.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
      );
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'install_guidance',
        'scan_relations',
        'scan_structure',
        'update_maps',
      ]);
      await client.close();
    } finally {
      docker(['stop', containerId]);
    }
  }, 120000);
});

describe.runIf(!dockerAvailable)('docker smoke (US3) — docker unavailable', () => {
  it.skip('skipped: no reachable Docker daemon on this machine', () => {});
});
