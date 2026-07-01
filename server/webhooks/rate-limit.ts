/**
 * Ad-hoc, in-memory sliding-window rate limiter for the webhook endpoint.
 *
 * NOTE: The backend has no shared rate-limiting primitive; this limiter is
 * process-local and resets on restart. It is adequate for per-instance abuse
 * control on the public webhook surface, but is NOT a substitute for a
 * distributed limiter (Redis / API gateway) in a multi-node deployment.
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= opts.limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)),
    };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: opts.limit - bucket.hits.length, retryAfterSec: 0 };
}

/** Periodically evict stale buckets so the map does not grow unbounded. */
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of buckets.entries()) {
    if (v.hits.length === 0 || v.hits[v.hits.length - 1] < cutoff) buckets.delete(k);
  }
}, 60_000).unref?.();
