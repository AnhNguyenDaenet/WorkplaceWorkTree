import { describe, expect, it } from 'vitest';
import { AsyncMutex } from '../../src/core/mutex.js';
import { sleep } from '../helpers.js';

describe('AsyncMutex', () => {
  it('serializes executions in FIFO order', async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];
    const first = mutex.runExclusive(async () => {
      await sleep(60);
      order.push(1);
      return 'a';
    });
    const second = mutex.runExclusive(async () => {
      order.push(2);
      return 'b';
    });
    const [r1, r2] = await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(r1.result).toBe('a');
    expect(r2.result).toBe('b');
  });

  it('reports queued wait duration for the second caller', async () => {
    const mutex = new AsyncMutex();
    const first = mutex.runExclusive(async () => {
      await sleep(80);
    });
    const second = mutex.runExclusive(async () => undefined);
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.queuedMs).toBeLessThan(30);
    expect(r2.queuedMs).toBeGreaterThanOrEqual(50);
  });

  it('releases the lock after an execution throws', async () => {
    const mutex = new AsyncMutex();
    await expect(
      mutex.runExclusive(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { result } = await mutex.runExclusive(async () => 42);
    expect(result).toBe(42);
  });
});
