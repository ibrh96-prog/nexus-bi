import type { Request, Response, NextFunction } from "express";
import {
  METRICS_CACHE_PREFIX,
  METRICS_TTL_SECONDS,
  cacheGetJson,
  cacheSetJson,
} from "./cache";

/**
 * Build a cache key that varies by the querystring shape the /metrics
 * endpoint actually reads. Extend as new filter params are added.
 */
function metricsCacheKey(req: Request): string {
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  return `${METRICS_CACHE_PREFIX}list:limit=${limit}`;
}

/**
 * Cache middleware for GET /api/metrics.
 *
 * Serves cached JSON on HIT and, on MISS, intercepts res.json() to write
 * the payload into Redis with a 5-minute TTL before it goes out the wire.
 */
export async function cacheMetrics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "GET") return next();

  const key = metricsCacheKey(req);
  const cached = await cacheGetJson<unknown>(key);
  if (cached !== null) {
    res.setHeader("X-Cache", "HIT");
    res.json(cached);
    return;
  }

  res.setHeader("X-Cache", "MISS");
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only cache successful responses — never persist 4xx/5xx payloads.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Fire-and-forget; failures are already reported inside cacheSetJson.
      void cacheSetJson(key, body, METRICS_TTL_SECONDS);
    }
    return originalJson(body);
  };
  next();
}
