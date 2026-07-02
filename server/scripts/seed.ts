/**
 * One-off, idempotent seed. Run via `npm run db:seed` (wired into Render's
 * Pre-Deploy Command as `db:migrate && db:seed`). Safe to re-run: every
 * insert is guarded by a row-count check, so it only ever seeds once.
 */
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, pool } from "../db.js";
import {
  users,
  metrics,
  revenueSeries,
  capacitySnapshots,
  resourceDistribution,
  aiInsights,
} from "../schema.js";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "ibrh96@gmail.com";

async function seedAdminUser() {
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existing) {
    console.log(`[seed] admin user ${ADMIN_EMAIL} already exists — skipping`);
    return;
  }
  await db.insert(users).values({ email: ADMIN_EMAIL, role: "admin" });
  console.log(`[seed] created admin user ${ADMIN_EMAIL}`);
}

async function seedIfEmpty(table: PgTable, name: string, rows: Record<string, unknown>[]) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  if (count > 0) {
    console.log(`[seed] ${name} already has ${count} row(s) — skipping`);
    return;
  }
  await db.insert(table).values(rows as never[]);
  console.log(`[seed] inserted ${rows.length} row(s) into ${name}`);
}

async function main() {
  await seedAdminUser();

  await seedIfEmpty(metrics, "metrics", [
    {
      revenue: "1840000",
      activeWorkflows: 247,
      predictedChurn: "0.032",
      averageResolutionTime: 252,
    },
  ]);

  await seedIfEmpty(
    revenueSeries,
    "revenue_series",
    [
      { period: "Jan", revenue: "128000", forecast: "130000", automated: "42000" },
      { period: "Feb", revenue: "142000", forecast: "138000", automated: "51000" },
      { period: "Mar", revenue: "156000", forecast: "149000", automated: "63000" },
      { period: "Apr", revenue: "168000", forecast: "161000", automated: "74000" },
      { period: "May", revenue: "182000", forecast: "175000", automated: "88000" },
      { period: "Jun", revenue: "201000", forecast: "190000", automated: "102000" },
      { period: "Jul", revenue: "218000", forecast: "208000", automated: "121000" },
      { period: "Aug", revenue: "234000", forecast: "224000", automated: "138000" },
      { period: "Sep", revenue: "251000", forecast: "240000", automated: "154000" },
      { period: "Oct", revenue: "268000", forecast: "258000", automated: "172000" },
      { period: "Nov", revenue: "289000", forecast: "275000", automated: "191000" },
      { period: "Dec", revenue: "312000", forecast: "296000", automated: "214000" },
    ],
  );

  await seedIfEmpty(capacitySnapshots, "capacity_snapshots", [
    { team: "Support", used: 78, capacity: 100 },
    { team: "Sales", used: 62, capacity: 100 },
    { team: "Engineering", used: 91, capacity: 100 },
    { team: "Finance", used: 44, capacity: 100 },
    { team: "Marketing", used: 68, capacity: 100 },
    { team: "Ops", used: 82, capacity: 100 },
  ]);

  await seedIfEmpty(resourceDistribution, "resource_distribution", [
    { name: "Compute", value: 34 },
    { name: "Storage", value: 22 },
    { name: "AI Inference", value: 26 },
    { name: "Networking", value: 12 },
    { name: "Other", value: 6 },
  ]);

  await seedIfEmpty(aiInsights, "ai_insights", [
    {
      type: "anomaly",
      severity: "critical",
      message:
        "Anomaly detected in Q3 server costs — AWS EC2 spend spiked 34% above the 30-day baseline on us-east-1. Root cause: idle GPU instances in ml-training cluster.",
      context: { tag: "Cost" },
    },
    {
      type: "recommendation",
      severity: "low",
      message:
        "Reroute 20% of support tickets — recent query trends show 1,240 tickets could be auto-resolved by the knowledge base. Est. savings: 62 agent-hours/week.",
      context: { tag: "Ops" },
    },
    {
      type: "anomaly",
      severity: "low",
      message: "Churn model retrained — model v4.11 improved F1 by 4.2%. 23 new at-risk accounts flagged in the last hour.",
      context: { tag: "ML" },
    },
    {
      type: "anomaly",
      severity: "medium",
      message:
        "Salesforce sync degraded — API latency > 2.1s on lead-enrichment webhook. Retries succeeding but pipeline throughput reduced by 12%.",
      context: { tag: "Integration" },
    },
    {
      type: "recommendation",
      severity: "low",
      message:
        "Shift EU workloads to Frankfurt — predicted 22% latency improvement for 4,300 daily active users. Migration risk: low.",
      context: { tag: "Infra" },
    },
  ]);
}

main()
  .then(() => {
    console.log("[seed] done");
  })
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
