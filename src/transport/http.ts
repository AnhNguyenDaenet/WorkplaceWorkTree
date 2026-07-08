import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { TransportConfiguration } from '../cli/args.js';
import { AsyncMutex } from '../core/mutex.js';
import { createServer } from '../server.js';
import { SERVER_NAME, VERSION } from '../version.js';

/**
 * HTTP transport (T015, FR-005/FR-007/FR-009, research R3): MCP Streamable HTTP in
 * stateless mode at POST/GET/DELETE /mcp. A fresh McpServer+transport pair serves each
 * request (SDK stateless pattern) while every tool handler shares one process-wide
 * mutex, so execution stays serialized and writes stay atomic across concurrent
 * clients. Binds 127.0.0.1 unless --host was an explicit opt-in.
 */
export function startHttp(config: TransportConfiguration): Promise<Server> {
  const mutex = new AsyncMutex();
  let inFlight = 0;
  let shuttingDown = false;

  const maybeExit = (): void => {
    if (shuttingDown && inFlight === 0) {
      console.error(`[${SERVER_NAME}] shutdown complete.`);
      process.exit(0);
    }
  };

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. The MCP endpoint is /mcp.' }));
      return;
    }
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? '')) {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST, GET, DELETE' });
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }

    inFlight++;
    const server = createServer({
      workspaceRoot: config.workspaceRoot,
      maxDocLines: config.maxDocLines,
      mutex,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
      inFlight--;
      maybeExit();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error(
        `[${SERVER_NAME}] request error: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error.' }));
      } else {
        res.end();
      }
    }
  };

  const httpServer = createHttpServer((req, res) => {
    void handler(req, res);
  });

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(
      `[${SERVER_NAME}] ${signal} received — no longer accepting requests; draining ${inFlight} in-flight request(s)…`,
    );
    httpServer.close();
    httpServer.closeIdleConnections();
    maybeExit();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return new Promise((resolve, reject) => {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[${SERVER_NAME}] port ${config.port} is already in use on ${config.host}. ` +
            'Stop the other process or pass a different --port.',
        );
      } else {
        console.error(`[${SERVER_NAME}] failed to bind ${config.host}:${config.port}: ${err.message}`);
      }
      process.exit(1);
      reject(err);
    });
    httpServer.listen(config.port, config.host, () => {
      console.error(
        `[${SERVER_NAME}] v${VERSION} ready — transport: http, url: http://${config.host}:${config.port}/mcp, workspace: ${config.workspaceInput}`,
      );
      resolve(httpServer);
    });
  });
}
