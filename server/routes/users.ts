import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users, userRoles } from "../schema";
import { requireAdmin } from "../auth";
import { auditFromRequest } from "../audit";

const router = Router();

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

const idParam = z.object({ id: z.string().uuid() });
const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(userRoles).default("viewer"),
});
const updateSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(userRoles).optional(),
});

// All user-management endpoints are Admin-only.
router.use(requireAdmin);

router.get(
  "/",
  wrap(async (_req, res) => {
    const rows = await db.select().from(users);
    res.json(rows);
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const data = createSchema.parse(req.body);
    const [row] = await db.insert(users).values(data).returning();
    await auditFromRequest(req, {
      action: "create",
      resourceType: "user",
      resourceId: row.id,
      payload: { after: row },
    });
    res.status(201).json(row);
  }),
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = updateSchema.parse(req.body);
    const [before] = await db.select().from(users).where(eq(users.id, id));
    const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!row) return res.status(404).json({ error: "User not found" });
    await auditFromRequest(req, {
      action: "update",
      resourceType: "user",
      resourceId: row.id,
      payload: { before, after: row, patch },
    });
    res.json(row);
  }),
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const [before] = await db.select().from(users).where(eq(users.id, id));
    const [row] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) return res.status(404).json({ error: "User not found" });
    await auditFromRequest(req, {
      action: "delete",
      resourceType: "user",
      resourceId: row.id,
      payload: { before },
    });
    res.status(204).end();
  }),
);

export default router;
