import { logger } from "./logger.js";

/**
 * Exponential backoff with jitter. Distinguishes permanent failures (never retried) from
 * temporary ones (retried up to maxRetries). See docs/ARCHITECTURE.md "Relayer retry system".
 */
export class PermanentError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
  ) {
    super(message);
    this.name = "PermanentError";
  }
}

export interface RetryOptions {
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  jobId: string;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      if (err instanceof PermanentError) {
        logger.error("permanent failure — will not retry", {
          jobId: opts.jobId,
          attempt,
          errorCode: err.errorCode,
        });
        throw err;
      }
      if (attempt >= opts.maxRetries) {
        logger.error("exhausted retries", { jobId: opts.jobId, attempt, errorCode: "MAX_RETRIES_EXCEEDED" });
        throw err;
      }
      const exponential = Math.min(opts.baseBackoffMs * 2 ** (attempt - 1), opts.maxBackoffMs);
      const jitterMs = Math.floor(Math.random() * exponential * 0.25);
      const delayMs = exponential + jitterMs;
      logger.warn("retrying after backoff", { jobId: opts.jobId, attempt, delayMs });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
