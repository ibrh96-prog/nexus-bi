import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[pg] unexpected pool error", err);
  // Report DB connection failures to Sentry — these never flow through Express.
  import("./observability").then(({ reportServerError }) =>
    reportServerError(err, { subsystem: "pg-pool" }),
  );
});

export const db = drizzle(pool, { schema });
export { schema };
export type DB = typeof db;
