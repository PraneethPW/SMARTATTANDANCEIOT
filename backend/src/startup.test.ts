import assert from 'node:assert/strict';
import test from 'node:test';
import { retryWithBackoff } from './startup.js';

test('returns immediately when startup succeeds', async () => {
  let calls = 0;
  const result = await retryWithBackoff(
    async () => {
      calls += 1;
      return 'ready';
    },
    { attempts: 3, initialDelayMs: 0, maxDelayMs: 0 },
  );

  assert.equal(result, 'ready');
  assert.equal(calls, 1);
});

test('retries transient startup failures', async () => {
  let calls = 0;
  const retryAttempts: number[] = [];
  const result = await retryWithBackoff(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('temporary database outage');
      return 'ready';
    },
    {
      attempts: 4,
      initialDelayMs: 0,
      maxDelayMs: 0,
      onRetry: (_error, attempt) => retryAttempts.push(attempt),
    },
  );

  assert.equal(result, 'ready');
  assert.deepEqual(retryAttempts, [1, 2]);
});

test('rethrows the final startup error', async () => {
  const failure = new Error('database unavailable');
  await assert.rejects(
    retryWithBackoff(async () => Promise.reject(failure), {
      attempts: 2,
      initialDelayMs: 0,
      maxDelayMs: 0,
    }),
    failure,
  );
});
