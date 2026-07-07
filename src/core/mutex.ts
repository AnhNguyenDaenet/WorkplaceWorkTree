/**
 * Async mutex serializing tool executions (FR-014).
 * Queued callers wait; the measured queue time is surfaced so tool reports
 * can warn "queued for <n> ms" (contracts/mcp-tools.md, update_maps guarantees).
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<{ result: T; queuedMs: number }> {
    const enqueuedAt = Date.now();
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    const queuedMs = Date.now() - enqueuedAt;
    try {
      const result = await fn();
      return { result, queuedMs };
    } finally {
      release();
    }
  }
}
