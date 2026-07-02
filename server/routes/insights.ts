import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { aiInsights, insightStatuses, insightTypes } from "../schema.js";

const router = Router();

const createSchema = z.object({
  type: z.enum(insightTypes),
  message: z.string().trim().min(1).max(2000),
  status: z.enum(insightStatuses).default("pending"),
});

const updateSchema = z.object({
  type: z.enum(insightTypes).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  status: z.enum(insightStatuses).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  status: z.enum(insightStatuses).optional(),
  type: z.enum(insightTypes).optional(),
});

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const q = listQuery.parse(req.query);
    const filters = [
      q.status ? eq(aiInsights.status, q.status) : undefined,
      q.type ? eq(aiInsights.type, q.type) : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[];
    const where = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select()
      .from(aiInsights)
      .where(where)
      .orderBy(desc(aiInsights.createdAt));
    res.json(rows);
  }),
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db.select().from(aiInsights).where(eq(aiInsights.id, id));
    if (!row) return res.status(404).json({ error: "Insight not found" });
    res.json(row);
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db.insert(aiInsights).values(data).returning();
    res.status(201).json(row);
  }),
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = updateSchema.parse(req.body);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    const [row] = await db.update(aiInsights).set(patch).where(eq(aiInsights.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Insight not found" });
    res.json(row);
  }),
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .delete(aiInsights)
      .where(eq(aiInsights.id, id))
      .returning({ id: aiInsights.id });
    if (!row) return res.status(404).json({ error: "Insight not found" });
    res.status(204).end();
  }),
);

export default router;
