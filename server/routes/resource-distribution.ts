import { Router, type Request, type Response, type NextFunction } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { resourceDistribution } from "../schema.js";
import { requireAnyRole, requireEditor } from "../auth.js";
import { auditFromRequest } from "../audit.js";

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.number().int().min(0).max(100),
});

const updateSchema = createSchema.partial();
const idParam = z.object({ id: z.string().uuid() });

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.get(
  "/",
  requireAnyRole,
  wrap(async (_req, res) => {
    const rows = await db
      .select()
      .from(resourceDistribution)
      .orderBy(asc(resourceDistribution.recordedAt));
    res.json(rows);
  }),
);

router.post(
  "/",
  requireEditor,
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db.insert(resourceDistribution).values(data).returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "resource_distribution",
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
    const [before] = await db
      .select()
      .from(resourceDistribution)
      .where(eq(resourceDistribution.id, id));
    const [row] = await db
      .update(resourceDistribution)
      .set(patch)
      .where(eq(resourceDistribution.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Resource distribution entry not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "resource_distribution",
      resourceId: row.id,
      payload: { before: before ?? null, after: row, patch },
    });
    res.json(row);
  }),
);

router.delete(
  "/:id",
  requireEditor,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [before] = await db
      .select()
      .from(resourceDistribution)
      .where(eq(resourceDistribution.id, id));
    const [row] = await db
      .delete(resourceDistribution)
      .where(eq(resourceDistribution.id, id))
      .returning({ id: resourceDistribution.id });
    if (!row) return res.status(404).json({ error: "Resource distribution entry not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "resource_distribution",
      resourceId: row.id,
      payload: { before: before ?? null },
    });
    res.status(204).end();
  }),
);

export default router;
