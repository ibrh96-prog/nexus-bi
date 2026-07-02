import { Router, type Request, type Response, type NextFunction } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { metrics } from "../schema.js";
import { requireAnyRole, requireEditor } from "../auth.js";
import { auditFromRequest } from "../audit.js";
import { cacheMetrics } from "../cache-middleware.js";
import { cacheInvalidatePrefix, METRICS_CACHE_PREFIX } from "../cache.js";

const router = Router();

const createSchema = z.object({
  revenue: z.number().finite().nonnegative(),
  activeWorkflows: z.number().int().nonnegative(),
  predictedChurn: z.number().min(0).max(1),
  averageResolutionTime: z.number().int().nonnegative(),
  recordedAt: z.coerce.date().optional(),
});

const updateSchema = createSchema.partial();
const idParam = z.object({ id: z.string().uuid() });

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// Drizzle numeric columns come back as strings; serialize numeric fields to numbers.
const toNumeric = <T extends { revenue: unknown; predictedChurn: unknown }>(row: T) => ({
  ...row,
  revenue: Number(row.revenue),
  predictedChurn: Number(row.predictedChurn),
});

router.get(
  "/",
  requireAnyRole,
  cacheMetrics,
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const rows = await db.select().from(metrics).orderBy(desc(metrics.recordedAt)).limit(limit);
    res.json(rows.map(toNumeric));
  }),
);

router.get(
  "/:id",
  requireAnyRole,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.select().from(metrics).where(eq(metrics.id, id));
    if (!row) return res.status(404).json({ error: "Metric not found" });
    res.json(toNumeric(row));
  }),
);

router.post(
  "/",
  requireEditor,
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db
      .insert(metrics)
      .values({
        revenue: data.revenue.toString(),
        activeWorkflows: data.activeWorkflows,
        predictedChurn: data.predictedChurn.toString(),
        averageResolutionTime: data.averageResolutionTime,
        recordedAt: data.recordedAt,
      })
      .returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "metric",
      resourceId: row.id,
      payload: { after: toNumeric(row) },
    });
    await cacheInvalidatePrefix(METRICS_CACHE_PREFIX);
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
    if (patch.revenue !== undefined) values.revenue = patch.revenue.toString();
    if (patch.activeWorkflows !== undefined) values.activeWorkflows = patch.activeWorkflows;
    if (patch.predictedChurn !== undefined) values.predictedChurn = patch.predictedChurn.toString();
    if (patch.averageResolutionTime !== undefined)
      values.averageResolutionTime = patch.averageResolutionTime;
    if (patch.recordedAt !== undefined) values.recordedAt = patch.recordedAt;

    const [before] = await db.select().from(metrics).where(eq(metrics.id, id));
    const [row] = await db.update(metrics).set(values).where(eq(metrics.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Metric not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "metric",
      resourceId: row.id,
      payload: {
        before: before ? toNumeric(before) : null,
        after: toNumeric(row),
        patch,
      },
    });
    await cacheInvalidatePrefix(METRICS_CACHE_PREFIX);
    res.json(toNumeric(row));
  }),
);

router.delete(
  "/:id",
  requireEditor,
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [before] = await db.select().from(metrics).where(eq(metrics.id, id));
    const [row] = await db.delete(metrics).where(eq(metrics.id, id)).returning({ id: metrics.id });
    if (!row) return res.status(404).json({ error: "Metric not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "metric",
      resourceId: row.id,
      payload: { before: before ? toNumeric(before) : null },
    });
    await cacheInvalidatePrefix(METRICS_CACHE_PREFIX);
    res.status(204).end();
  }),
);

export default router;
