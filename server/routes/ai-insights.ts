import { Router, type Request, type Response, type NextFunction } from "express";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { aiInsights, metrics, type Metric } from "../schema.js";
import { invalidateDashboardCaches } from "../cache.js";

const router = Router();

/* ------------------------------------------------------------------ */
/* Provider selection                                                  */
/* ------------------------------------------------------------------ */
type Provider = "openai" | "anthropic";
const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) ?? "openai";
const OPENAI_MODEL = process.env.AI_MODEL ?? "gpt-4o";
const ANTHROPIC_MODEL = process.env.AI_MODEL ?? "claude-3-5-sonnet-latest";

/* ------------------------------------------------------------------ */
/* Structured output contract                                          */
/* ------------------------------------------------------------------ */
const insightItemSchema = z.object({
  type: z.enum(["anomaly", "recommendation"]),
  message: z.string().trim().min(1).max(2000),
  severity: z.enum(["low", "medium", "high"]).optional(),
  metric: z.string().optional(),
});
const aiResponseSchema = z.object({
  anomalies: z.array(insightItemSchema).default([]),
  recommendations: z.array(insightItemSchema).default([]),
  summary: z.string().max(2000).optional(),
});
type AiResponse = z.infer<typeof aiResponseSchema>;

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */
function buildSystemPrompt() {
  return [
    "You are a senior Data Analyst for an enterprise Business Intelligence platform.",
    "Analyze the operational metrics provided by the user and produce concise, actionable insights.",
    "",
    "Rules:",
    "- Base every observation strictly on the numbers provided; do not invent data.",
    "- Anomalies must reference the specific metric and describe why the value is unusual.",
    "- Recommendations must be practical operational actions a business team can take this week.",
    "- Keep each `message` under 240 characters.",
    "",
    "Return ONLY valid JSON matching exactly this shape (no markdown, no prose):",
    "{",
    '  "anomalies":       [{ "type": "anomaly",        "message": string, "severity": "low"|"medium"|"high", "metric": string }],',
    '  "recommendations": [{ "type": "recommendation", "message": string, "severity": "low"|"medium"|"high", "metric": string }],',
    '  "summary": string',
    "}",
  ].join("\n");
}

function buildUserPrompt(latest: Metric, history: Metric[]) {
  const compact = history.map((m) => ({
    at: m.recordedAt,
    revenue: Number(m.revenue),
    active_workflows: m.activeWorkflows,
    predicted_churn: Number(m.predictedChurn),
    avg_resolution_seconds: m.averageResolutionTime,
  }));
  return [
    "Latest metrics snapshot:",
    JSON.stringify(
      {
        revenue: Number(latest.revenue),
        active_workflows: latest.activeWorkflows,
        predicted_churn: Number(latest.predictedChurn),
        avg_resolution_seconds: latest.averageResolutionTime,
        recorded_at: latest.recordedAt,
      },
      null,
      2,
    ),
    "",
    "Recent history (most recent first, up to 20 points):",
    JSON.stringify(compact, null, 2),
    "",
    "Produce anomalies and recommendations per the system instructions.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Provider calls                                                      */
/* ------------------------------------------------------------------ */
async function callOpenAI(system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new UpstreamError(`OpenAI ${res.status}: ${text.slice(0, 500)}`, res.status);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new UpstreamError("OpenAI returned no content", 502);
  return content;
}

async function callAnthropic(system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new UpstreamError(`Anthropic ${res.status}: ${text.slice(0, 500)}`, res.status);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const content = json.content?.find((c) => c.type === "text")?.text;
  if (!content) throw new UpstreamError("Anthropic returned no content", 502);
  return content;
}

class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/* Some models wrap JSON in ```json fences even when asked not to. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */
const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.post(
  "/",
  wrap(async (_req, res) => {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "AI_API_KEY is not configured on the server" });
    }

    // 1. Load latest metrics + recent history for context.
    const history = await db.select().from(metrics).orderBy(desc(metrics.recordedAt)).limit(20);

    const [latest] = history;
    if (!latest) {
      return res.status(404).json({ error: "No metrics available to analyze" });
    }

    // 2. Build prompts and call the selected model.
    const system = buildSystemPrompt();
    const user = buildUserPrompt(latest, history);

    let raw: string;
    try {
      raw =
        PROVIDER === "anthropic"
          ? await callAnthropic(system, user, apiKey)
          : await callOpenAI(system, user, apiKey);
    } catch (err) {
      if (err instanceof UpstreamError) {
        const status = err.status === 429 ? 429 : 502;
        return res
          .status(status)
          .json({ error: "AI provider request failed", detail: err.message });
      }
      throw err;
    }

    // 3. Parse + validate the model output.
    let parsed: AiResponse;
    try {
      parsed = aiResponseSchema.parse(extractJson(raw));
    } catch (err) {
      return res.status(502).json({
        error: "AI response did not match the expected schema",
        detail: err instanceof Error ? err.message : String(err),
        raw: raw.slice(0, 1000),
      });
    }

    // 4. Persist to ai_insights.
    const rows = [
      ...parsed.anomalies.map((a) => ({
        type: "anomaly" as const,
        message: a.message,
        status: "pending" as const,
      })),
      ...parsed.recommendations.map((r) => ({
        type: "recommendation" as const,
        message: r.message,
        status: "pending" as const,
      })),
    ];

    const inserted = rows.length ? await db.insert(aiInsights).values(rows).returning() : [];

    // New insights generated — bust cached dashboard reads.
    if (inserted.length) await invalidateDashboardCaches();

    // 5. Return structured JSON to the client.
    return res.status(201).json({
      provider: PROVIDER,
      model: PROVIDER === "anthropic" ? ANTHROPIC_MODEL : OPENAI_MODEL,
      metricsContext: {
        revenue: Number(latest.revenue),
        activeWorkflows: latest.activeWorkflows,
        predictedChurn: Number(latest.predictedChurn),
        averageResolutionTime: latest.averageResolutionTime,
        recordedAt: latest.recordedAt,
      },
      insights: parsed,
      persisted: inserted,
    });
  }),
);

export default router;
