/**
 * Unit tests for POST /api/ai/insights.
 *
 * The DB layer and global fetch are mocked so the test exercises the route
 * handler's logic (prompt assembly, provider dispatch, schema validation,
 * persistence) without hitting Postgres or the real OpenAI/Anthropic APIs.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------- Mocks -------------------------------------------------------- */

const insertReturning = vi.fn();
const selectChain = {
  from: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: insertReturning })),
    })),
  },
}));

vi.mock("../schema", () => ({
  aiInsights: { _: "aiInsights" },
  metrics: { _: "metrics" },
}));

/* ---------- Fixtures ----------------------------------------------------- */

const sampleMetric = {
  id: "m1",
  revenue: "12345.67",
  activeWorkflows: 42,
  predictedChurn: "0.031",
  averageResolutionTime: 1800,
  recordedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const goodModelPayload = {
  anomalies: [
    {
      type: "anomaly",
      message: "Revenue dipped 12% vs. 7-day mean.",
      severity: "medium",
      metric: "revenue",
    },
  ],
  recommendations: [
    {
      type: "recommendation",
      message: "Rebalance queue workers during 14:00-16:00 UTC peak.",
      severity: "low",
      metric: "avg_resolution_seconds",
    },
  ],
  summary: "Overall healthy; minor revenue variance.",
};

/* ---------- Test server -------------------------------------------------- */

let server: import("node:http").Server;
let baseUrl: string;
const fetchMock = vi.fn();

beforeAll(async () => {
  process.env.AI_API_KEY = "test-key";
  process.env.AI_PROVIDER = "openai";
  vi.stubGlobal("fetch", fetchMock);

  const { default: router } = await import("../routes/ai-insights");
  const app = express();
  app.use(express.json());
  app.use("/api/ai/insights", router);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  selectChain.limit.mockResolvedValue([sampleMetric]);
  insertReturning.mockResolvedValue([{ id: "ins-1" }, { id: "ins-2" }]);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ---------- Tests -------------------------------------------------------- */

describe("POST /api/ai/insights", () => {
  it("calls OpenAI, validates the response, and persists insights", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(goodModelPayload) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.provider).toBe("openai");
    expect(body.insights.anomalies).toHaveLength(1);
    expect(body.insights.recommendations).toHaveLength(1);
    expect(body.persisted).toHaveLength(2);

    // Verify the OpenAI call was well-formed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init as RequestInit).method).toBe("POST");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent.model).toBe("gpt-4o");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages[0].role).toBe("system");

    // Verify persistence shape.
    expect(insertReturning).toHaveBeenCalledTimes(1);
  });

  it("strips ```json fences from model output before parsing", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "```json\n" + JSON.stringify(goodModelPayload) + "\n```" } },
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(201);
  });

  it("returns 502 when the model returns malformed JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json at all" } }] }), {
        status: 200,
      }),
    );

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(502);
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("returns 429 when OpenAI rate-limits", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(429);
  });

  it("returns 404 when no metrics exist", async () => {
    selectChain.limit.mockResolvedValueOnce([]);

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when AI_API_KEY is missing", async () => {
    const prev = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;

    const res = await fetch(`${baseUrl}/api/ai/insights`, { method: "POST" });
    expect(res.status).toBe(500);

    process.env.AI_API_KEY = prev;
  });
});
