import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { integrations, signatureSchemes } from "../schema";
import { requireAnyRole, requireEditor } from "../auth";
import { auditFromRequest } from "../audit";

const router = Router();

const mappingRuleSchema = z.object({
  source: z.string().min(1).max(500),
  target: z.string().min(1).max(200),
  default: z.unknown().optional(),
});

const createSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(60).default("custom"),
  signatureScheme: z.enum(signatureSchemes).default("none"),
  signatureHeader: z.string().trim().min(1).max(120).optional(),
  signingSecret: z.string().min(16).max(512).optional(),
  mappingRules: z.array(mappingRuleSchema).default([]),
  enabled: z.boolean().default(true),
});

const updateSchema = createSchema.partial().omit({ workflowId: true });

const idParam = z.object({ id: z.string().uuid() });

router.get("/", requireAnyRole, async (_req: Request, res: Response) => {
  const rows = await db.select().from(integrations);
  res.json(rows);
});

router.post("/", requireEditor, async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  if (body.signatureScheme !== "none" && (!body.signingSecret || !body.signatureHeader)) {
    return res
      .status(400)
      .json({ error: "signature scheme requires signingSecret and signatureHeader" });
  }
  const secret = randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(integrations)
    .values({
      userId: req.user!.id,
      workflowId: body.workflowId,
      name: body.name,
      provider: body.provider,
      secret,
      signatureScheme: body.signatureScheme,
      signatureHeader: body.signatureHeader ?? null,
      signingSecret: body.signingSecret ?? null,
      mappingRules: body.mappingRules,
      enabled: body.enabled ? "true" : "false",
    })
    .returning();
  await auditFromRequest(req, {
    action: "integration.create",
    resourceType: "integration",
    resourceId: row.id,
    payload: { name: row.name, provider: row.provider, workflowId: row.workflowId },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireEditor, async (req: Request, res: Response) => {
  const { id } = idParam.parse(req.params);
  const patch = updateSchema.parse(req.body);
  const [row] = await db
    .update(integrations)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.provider !== undefined && { provider: patch.provider }),
      ...(patch.signatureScheme !== undefined && { signatureScheme: patch.signatureScheme }),
      ...(patch.signatureHeader !== undefined && { signatureHeader: patch.signatureHeader }),
      ...(patch.signingSecret !== undefined && { signingSecret: patch.signingSecret }),
      ...(patch.mappingRules !== undefined && { mappingRules: patch.mappingRules }),
      ...(patch.enabled !== undefined && { enabled: patch.enabled ? "true" : "false" }),
    })
    .where(eq(integrations.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  await auditFromRequest(req, {
    action: "integration.update",
    resourceType: "integration",
    resourceId: row.id,
    payload: patch,
  });
  res.json(row);
});

router.delete("/:id", requireEditor, async (req: Request, res: Response) => {
  const { id } = idParam.parse(req.params);
  const [row] = await db.delete(integrations).where(eq(integrations.id, id)).returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  await auditFromRequest(req, {
    action: "integration.delete",
    resourceType: "integration",
    resourceId: row.id,
    payload: { name: row.name },
  });
  res.status(204).end();
});

/** Rotate the URL secret — invalidates existing webhook URL. */
router.post("/:id/rotate-secret", requireEditor, async (req: Request, res: Response) => {
  const { id } = idParam.parse(req.params);
  const secret = randomBytes(24).toString("base64url");
  const [row] = await db
    .update(integrations)
    .set({ secret })
    .where(eq(integrations.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  await auditFromRequest(req, {
    action: "integration.rotate_secret",
    resourceType: "integration",
    resourceId: row.id,
    payload: {},
  });
  res.json({ id: row.id, secret: row.secret });
});

export default router;
