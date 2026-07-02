import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db.js";

/** Applies any pending SQL migrations from ./drizzle before the server starts serving traffic. */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console
  console.log("[db] migrations up to date");
}
