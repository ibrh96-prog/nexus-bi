import { Router, type Request, type Response, type NextFunction } from "express";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { auditLogs } from "../schema";
import { requireAdmin } from "../auth";
import { verifyAuditChain } from "../audit";

const router = Router();

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(requireAdmin);

router.get(
  "/",
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
    res.json(rows);
  }),
);

router.get(
  "/verify",
  wrap(async (_req, res) => {
    res.json(await verifyAuditChain());
  }),
);

export default router;
