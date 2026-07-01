import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { workflows } from "../schema";
import { requireAnyRole, requireEditor } from "../auth";
import { auditFromRequest } from "../audit";

const router = Router();

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()).optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

const createSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.get(
  "/",
  requireAnyRole,
  wrap(async (_req, res) => {
    const rows = await db.select().from(workflows);
    res.json(rows);
  }),
);

router.get(
  "/:id",
  requireAnyRole,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.select().from(workflows).where(eq(workflows.id, id));
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  }),
);

router.post(
  "/",
  requireEditor,
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db.insert(workflows).values(data).returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "workflow",
      resourceId: row.id,
      payload: { after: row },
    });
    res.status(201).json(row);
  }),
);

router.put(
  "/:id",
  requireEditor,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = updateSchema.parse(req.body);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    const [before] = await db.select().from(workflows).where(eq(workflows.id, id));
    const [row] = await db
      .update(workflows)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(workflows.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "workflow",
      resourceId: row.id,
      payload: { before, after: row, patch },
    });
    res.json(row);
  }),
);

router.delete(
  "/:id",
  requireEditor,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [before] = await db.select().from(workflows).where(eq(workflows.id, id));
    const [row] = await db
      .delete(workflows)
      .where(eq(workflows.id, id))
      .returning({ id: workflows.id });
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "workflow",
      resourceId: row.id,
      payload: { before },
    });
    res.status(204).end();
  }),
);

export default router;
