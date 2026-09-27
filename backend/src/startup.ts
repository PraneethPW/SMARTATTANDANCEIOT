import { setTimeout as delay } from 'node:timers/promises';

type RetryOptions = {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export async function retryWithBackoff<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  if (options.attempts < 1) throw new RangeError('attempts must be at least 1');

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === options.attempts) throw error;

      const delayMs = Math.min(options.initialDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      options.onRetry?.(error, attempt, delayMs);
      await delay(delayMs);
    }
  }

  throw new Error('Retry loop completed unexpectedly');
}
