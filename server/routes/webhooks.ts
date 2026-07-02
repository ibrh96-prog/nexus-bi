import { Router, type Request, type Response } from "express";
import express from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { integrations, workflows, workflowRuns } from "../schema.js";
import { verifySignature } from "../webhooks/signature.js";
import { applyMapping, injectIntoStartNode } from "../webhooks/mapping.js";
import { checkRateLimit } from "../webhooks/rate-limit.js";
import { invalidateDashboardCaches } from "../cache.js";

const router = Router();

/** Hard cap on webhook payload size — reject before parsing/verifying. */
const MAX_BODY_BYTES = 256 * 1024; // 256 KiB

// Raw parser mounted only here so signature verification sees the exact bytes.
const rawJson = express.raw({
  type: "*/*",
  limit: MAX_BODY_BYTES,
  verify: (req, _res, buf) => {
    if (buf.length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  },
});

/**
 * POST /api/webhooks/:workflowId/:integrationSecret
 * Public endpoint — no auth middleware. Security is enforced per-request:
 *   1. size limit (express.raw limit)
 *   2. rate limit (per integrationSecret + source IP)
 *   3. HMAC signature verification per integration.signatureScheme
 */
const paramsSchema = z.object({
  workflowId: z.string(),
  integrationSecret: z.string(),
});

router.post("/:workflowId/:integrationSecret", rawJson, async (req: Request, res: Response) => {
  const { workflowId, integrationSecret } = paramsSchema.parse(req.params);
  const sourceIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.ip ??
    "unknown";

  // 1. Rate limit — 60 req/min per (secret, ip). Reject cheaply.
  const rl = checkRateLimit(`${integrationSecret}:${sourceIp}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
  }

  // 2. Lookup integration + workflow. Use constant response for unknown secret.
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.secret, integrationSecret), eq(integrations.workflowId, workflowId)))
    .limit(1);
  if (!integration || integration.enabled !== "true") {
    return res.status(404).json({ error: "not_found" });
  }

  // 3. Verify HMAC signature against the raw body bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const sigHeader = integration.signatureHeader
    ? ((req.headers[integration.signatureHeader.toLowerCase()] as string | undefined) ?? null)
    : null;
  const verdict = verifySignature({
    scheme: integration.signatureScheme,
    header: sigHeader,
    secret: integration.signingSecret,
    rawBody,
  });
  if (!verdict.ok) {
    await db.insert(workflowRuns).values({
      workflowId,
      integrationId: integration.id,
      sourceIp,
      rawPayload: null,
      mappedPayload: null,
      status: "rejected",
      error: verdict.reason ?? "signature_invalid",
    });
    return res.status(401).json({ error: "signature_invalid" });
  }

  // 4. Parse JSON body (post-verification).
  let payload: unknown = null;
  try {
    payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : null;
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }

  // 5. Apply mapping rules and inject into the start node.
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1);
  if (!workflow) return res.status(404).json({ error: "workflow_not_found" });

  const mapped = applyMapping(payload, integration.mappingRules);
  const { nodes: nextNodes, startNodeId } = injectIntoStartNode(workflow.nodes, mapped);

  await db
    .update(workflows)
    .set({ nodes: nextNodes, updatedAt: new Date() })
    .where(eq(workflows.id, workflowId));

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      integrationId: integration.id,
      sourceIp,
      rawPayload: payload,
      mappedPayload: mapped,
      status: "dispatched",
    })
    .returning();

  // A workflow just executed — dashboard aggregates may be stale.
  await invalidateDashboardCaches();

  return res.status(202).json({
    ok: true,
    runId: run.id,
    startNodeId,
    mappedKeys: Object.keys(mapped),
  });
});

export default router;
