/**
 * Redis client + tiny cache helpers.
 *
 * REDIS_URL is loaded from env (e.g. `redis://:pw@host:6379/0`). If it's
 * absent every helper becomes a no-op so local dev without Redis works
 * unchanged — the app just falls through to the DB every time.
 */
import { createClient, type RedisClientType } from "redis";
import { reportServerError } from "./observability";

const REDIS_URL = process.env.REDIS_URL;
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? "bi:";

export const METRICS_CACHE_PREFIX = `${KEY_PREFIX}metrics:`;
export const INSIGHTS_CACHE_PREFIX = `${KEY_PREFIX}insights:`;
export const METRICS_TTL_SECONDS = 60 * 5; // 5 minutes

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

async function getClient(): Promise<RedisClientType | null> {
  if (!REDIS_URL) return null;
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const c: RedisClientType = createClient({ url: REDIS_URL });
    c.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[redis] client error", err);
      reportServerError(err, { subsystem: "redis" });
    });
    try {
      await c.connect();
      client = c;
      return c;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[redis] connect failed — caching disabled for this call", err);
      reportServerError(err, { subsystem: "redis", phase: "connect" });
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function cacheGetJson<T = unknown>(key: string): Promise<T | null> {
  const c = await getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    reportServerError(err, { subsystem: "redis", op: "get", key });
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = await getClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    reportServerError(err, { subsystem: "redis", op: "set", key });
  }
}

/** Delete every key that starts with `prefix`. Uses SCAN + UNLINK to avoid blocking Redis. */
export async function cacheInvalidatePrefix(prefix: string): Promise<number> {
  const c = await getClient();
  if (!c) return 0;
  let removed = 0;
  try {
    for await (const key of c.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length) {
        removed += await c.unlink(keys);
      }
    }
  } catch (err) {
    reportServerError(err, { subsystem: "redis", op: "invalidate", prefix });
  }
  return removed;
}

/** Convenience: invalidate every cached metrics + insights variant. */
export async function invalidateDashboardCaches(): Promise<void> {
  await Promise.all([
    cacheInvalidatePrefix(METRICS_CACHE_PREFIX),
    cacheInvalidatePrefix(INSIGHTS_CACHE_PREFIX),
  ]);
}

/** Graceful shutdown hook for tests / SIGTERM. */
export async function closeCache(): Promise<void> {
  if (client?.isOpen) await client.quit();
  client = null;
}
