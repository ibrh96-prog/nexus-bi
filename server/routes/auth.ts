import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { users } from "../schema.js";
import { requireAnyRole } from "../auth.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret";

const loginSchema = z.object({ email: z.string().email() });

const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/**
 * Passwordless email login — looks the user up, issues a JWT if found.
 * No signup/auto-create: accounts are provisioned via POST /api/users by an
 * admin. This is a placeholder auth flow, not meant to survive a real
 * security review before external users touch this app.
 */
router.post(
  "/login",
  wrap(async (req, res) => {
    const { email } = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(404).json({ error: "No account found for that email" });
    }
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  }),
);

router.get("/me", requireAnyRole, (req: Request, res: Response) => {
  res.json(req.user);
});

export default router;
