import { Router, type Request, type Response, type NextFunction } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { revenueSeries } from "../schema.js";
import { requireAnyRole, requireEditor } from "../auth.js";
import { auditFromRequest } from "../audit.js";

const router = Router();

const createSchema = z.object({
  period: z.string().trim().min(1).max(50),
  revenue: z.number().finite().nonnegative(),
  forecast: z.number().finite().nonnegative(),
  automated: z.number().finite().nonnegative(),
});

const updateSchema = createSchema.partial();
const idParam = z.object({ id: z.string().uuid() });

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// Drizzle numeric columns come back as strings; serialize to numbers for JSON consumers.
const toNumeric = <T extends { revenue: unknown; forecast: unknown; automated: unknown }>(row: T) => ({
  ...row,
  revenue: Number(row.revenue),
  forecast: Number(row.forecast),
  automated: Number(row.automated),
});

router.get(
  "/",
  requireAnyRole,
  wrap(async (_req, res) => {
    const rows = await db.select().from(revenueSeries).orderBy(asc(revenueSeries.recordedAt));
    res.json(rows.map(toNumeric));
  }),
);

router.post(
  "/",
  requireEditor,
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db
      .insert(revenueSeries)
      .values({
        period: data.period,
        revenue: data.revenue.toString(),
        forecast: data.forecast.toString(),
        automated: data.automated.toString(),
      })
      .returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "revenue_series",
      resourceId: row.id,
      payload: { after: toNumeric(row) },
    });
    res.status(201).json(toNumeric(row));
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
    const values: Record<string, unknown> = {};
    if (patch.period !== undefined) values.period = patch.period;
    if (patch.revenue !== undefined) values.revenue = patch.revenue.toString();
    if (patch.forecast !== undefined) values.forecast = patch.forecast.toString();
    if (patch.automated !== undefined) values.automated = patch.automated.toString();

    const [before] = await db.select().from(revenueSeries).where(eq(revenueSeries.id, id));
    const [row] = await db
      .update(revenueSeries)
      .set(values)
      .where(eq(revenueSeries.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Revenue series point not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "revenue_series",
      resourceId: row.id,
      payload: { before: before ? toNumeric(before) : null, after: toNumeric(row), patch },
    });
    res.json(toNumeric(row));
  }),
);

router.delete(
  "/:id",
  requireEditor,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [before] = await db.select().from(revenueSeries).where(eq(revenueSeries.id, id));
    const [row] = await db
      .delete(revenueSeries)
      .where(eq(revenueSeries.id, id))
      .returning({ id: revenueSeries.id });
    if (!row) return res.status(404).json({ error: "Revenue series point not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "revenue_series",
      resourceId: row.id,
      payload: { before: before ? toNumeric(before) : null },
    });
    res.status(204).end();
  }),
);

export default router;
