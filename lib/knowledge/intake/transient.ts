/**
 * Network hiccups (a timeout, a dropped connection, a rate limit or a 5xx of OpenAI, Google or the file storage) are
 * not errors of the document: the same step is tried again a couple of times before the batch stops.
 */
const TRANSIENT = /fetch failed|timed out|timeout|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|Connection error|other side closed|rate limit|\b429\b|\b50[0-4]\b|overloaded|Service Unavailable/i;
export const isTransient = (error: unknown) => {
  const e = error as { message?: unknown; status?: unknown; code?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const status = typeof e?.status === "number" ? e.status : null;
  if (status === 429 || (status !== null && status >= 500)) return true;
  return TRANSIENT.test([e?.message, e?.code, e?.cause?.code, e?.cause?.message].filter(x => typeof x === "string").join(" "));
};

export async function withTransientRetry<T>(run: () => Promise<T>, { delays = [10_000, 30_000], sleep = (ms: number) => new Promise(r => setTimeout(r, ms)),
  onRetry }: { delays?: number[]; sleep?: (ms: number) => Promise<unknown>; onRetry?: (attempt: number, error: unknown) => void } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (attempt >= delays.length || !isTransient(error)) throw error;
      onRetry?.(attempt + 1, error);
      await sleep(delays[attempt]);
    }
  }
}

/** A run that died with the server (restart, closed laptop) leaves its claim behind; after this long it can be taken again. */
export const STALE_RUN_MS = 6 * 60 * 1000;
