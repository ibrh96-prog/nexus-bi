import cron from "node-cron";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "../db.js";
import { aiInsights, type AiInsight } from "../schema.js";
import { runAgentForInsight } from "./agent.js";

const CRITICAL_SEVERITIES = ["high", "critical"] as const;
const POLL_CRON = process.env.AGENT_WATCHER_CRON ?? "*/1 * * * *"; // every minute

const inFlight = new Set<string>();

async function processPendingAnomalies(): Promise<void> {
  const rows = (await db
    .select()
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.type, "anomaly"),
        eq(aiInsights.status, "pending"),
        inArray(aiInsights.severity, CRITICAL_SEVERITIES),
      ),
    )
    .orderBy(desc(aiInsights.createdAt))
    .limit(10)) as AiInsight[];

  for (const insight of rows) {
    if (inFlight.has(insight.id)) continue;
    inFlight.add(insight.id);

    try {
      // eslint-disable-next-line no-console
      console.log(`[agent] handling insight ${insight.id} (${insight.severity})`);
      const result = await runAgentForInsight(insight);
      await db.update(aiInsights).set({ status: "handled" }).where(eq(aiInsights.id, insight.id));
      // eslint-disable-next-line no-console
      console.log(
        `[agent] insight ${insight.id} handled — tools:`,
        result.toolCalls.map((c) => c.name).join(", ") || "(none)",
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[agent] insight ${insight.id} failed`, err);
    } finally {
      inFlight.delete(insight.id);
    }
  }
}

export function startAnomalyWatcher(): void {
  if (process.env.AGENT_WATCHER_ENABLED === "false") {
    // eslint-disable-next-line no-console
    console.log("[agent] watcher disabled via AGENT_WATCHER_ENABLED=false");
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn("[agent] OPENAI_API_KEY missing — watcher will start but skip runs");
  }

  cron.schedule(POLL_CRON, () => {
    processPendingAnomalies().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[agent] watcher tick failed", err);
    });
  });

  // eslint-disable-next-line no-console
  console.log(`[agent] anomaly watcher scheduled (${POLL_CRON})`);
}

export { processPendingAnomalies };
