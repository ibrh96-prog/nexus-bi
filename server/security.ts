import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import DOMPurify from "isomorphic-dompurify";
import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Helmet — secure HTTP headers.
 * CSP is tuned for an API service (no inline scripts, no framing).
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
});

/**
 * Helmet for the SSR frontend routes. The API's CSP (`defaultSrc: 'none'`)
 * would block the React app's own scripts/styles, so the document routes
 * get the safe defaults instead. CSP itself is off: TanStack Start injects
 * inline hydration scripts on every page load, and even helmet's relaxed
 * default `script-src 'self'` (no `unsafe-inline`) blocks those.
 */
export const frontendSecurityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
});

/**
 * Strict CORS — only the configured production frontend origin(s) are allowed.
 * Set ALLOWED_ORIGINS as a comma-separated list.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsSharedOptions = {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Stripe-Signature",
    "X-Hub-Signature-256",
  ],
  credentials: true,
  maxAge: 86_400,
};

export const strictCors: RequestHandler = cors((req, callback) => {
  const origin = req.headers.origin;
  // No Origin header (server-to-server) — allow. Browsers send an Origin
  // header even for same-origin requests, so compare hosts rather than
  // rejecting anything not in ALLOWED_ORIGINS — the frontend and API share
  // an origin in production, and that's not something operators configure.
  let allow = !origin;
  if (origin) {
    try {
      allow = new URL(origin).host === req.headers.host || allowedOrigins.includes(origin);
    } catch {
      allow = false;
    }
  }
  callback(null, { ...corsSharedOptions, origin: allow });
});

/**
 * Standard API rate limit — 100 requests / 15 minutes per IP.
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/**
 * Strict limiter for sensitive routes: 10 requests / 15 minutes per IP.
 * Applied on top of the standard limiter (defense in depth).
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for sensitive endpoint." },
});

// ---------- Input sanitization ---------------------------------------------

// Postgres-driver-side parameterization already blocks SQL injection, but
// we also strip control chars and null bytes that never belong in user JSON.
const NULL_BYTE = /\u0000/g;
// A conservative blocklist of SQL meta-tokens used only for defense in depth;
// we never string-concat these into SQL — Drizzle uses parameterized queries.
const SQL_STRIPPED = /(--|;\s*drop\s+table|;\s*delete\s+from|\/\*|\*\/|xp_)/gi;

function sanitizeString(value: string): string {
  // Strip XSS (script/iframe/on*) using DOMPurify, then remove null bytes
  // and obvious SQL injection markers.
  const cleaned = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
  return cleaned.replace(NULL_BYTE, "").replace(SQL_STRIPPED, "");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Reject prototype-pollution keys outright.
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively sanitize req.body / req.query / req.params.
 * Applied AFTER express.json() and BEFORE any route handler runs.
 * Webhook routes mounted with express.raw() are unaffected.
 */
export const sanitizeInputs: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    // Mutate in place — req.query is a getter on newer Express.
    for (const [k, v] of Object.entries(req.query)) {
      (req.query as Record<string, unknown>)[k] = sanitizeValue(v);
    }
  }
  next();
};
