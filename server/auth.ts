import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { users, type UserRole } from "./schema.js";

export type AuthenticatedUser = { id: string; email: string; role: UserRole };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret";

/** Decode Bearer JWT + load role from DB. Attaches req.user. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next(); // anonymous — authorize() will reject if required
    const token = header.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string; userId?: string };
    const userId = decoded.sub ?? decoded.userId;
    if (!userId) return next();

    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (row) req.user = { id: row.id, email: row.email, role: row.role };
    next();
  } catch {
    // Invalid token → treat as anonymous; authorize() will block protected routes.
    next();
  }
};

/**
 * Role gate. Usage: router.post("/", authorize(["admin","editor"]), handler)
 *
 * Convention: Viewer = read-only (GET), Editor = mutate workflows,
 * Admin = manage users + everything else.
 */
export const authorize =
  (allowedRoles: UserRole[]): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Forbidden", requiredRoles: allowedRoles, userRole: req.user.role });
    }
    next();
  };

/** Convenience aliases for the three canonical role sets. */
export const requireAdmin = authorize(["admin"]);
export const requireEditor = authorize(["admin", "editor"]);
export const requireAnyRole = authorize(["admin", "editor", "viewer"]);
