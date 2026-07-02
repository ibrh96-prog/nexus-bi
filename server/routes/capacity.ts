import { Router, type Request, type Response, type NextFunction } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { capacitySnapshots } from "../schema.js";
import { requireAnyRole, requireEditor } from "../auth.js";
import { auditFromRequest } from "../audit.js";

const router = Router();

const createSchema = z.object({
  team: z.string().trim().min(1).max(100),
  used: z.number().int().min(0).max(100),
  capacity: z.number().int().min(0).max(100),
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
      .from(capacitySnapshots)
      .orderBy(asc(capacitySnapshots.recordedAt));
    res.json(rows);
  }),
);

router.post(
  "/",
  requireEditor,
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db.insert(capacitySnapshots).values(data).returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "capacity_snapshot",
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
    const [before] = await db.select().from(capacitySnapshots).where(eq(capacitySnapshots.id, id));
    const [row] = await db
      .update(capacitySnapshots)
      .set(patch)
      .where(eq(capacitySnapshots.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Capacity snapshot not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "capacity_snapshot",
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
    const [before] = await db.select().from(capacitySnapshots).where(eq(capacitySnapshots.id, id));
    const [row] = await db
      .delete(capacitySnapshots)
      .where(eq(capacitySnapshots.id, id))
      .returning({ id: capacitySnapshots.id });
    if (!row) return res.status(404).json({ error: "Capacity snapshot not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "capacity_snapshot",
      resourceId: row.id,
      payload: { before: before ?? null },
    });
    res.status(204).end();
  }),
);

export default router;
