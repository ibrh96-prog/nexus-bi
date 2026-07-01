/**
 * Backend observability: Sentry for Node/Express.
 *
 * IMPORTANT: `initSentry()` must be called BEFORE any express() app is
 * created and BEFORE other modules that create HTTP clients / DB pools
 * are imported, so Sentry's auto-instrumentation can patch them.
 *
 * All keys are read from process.env — no defaults, no hardcoded DSNs.
 */
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import type { ErrorRequestHandler, RequestHandler } from "express";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.warn("[sentry] SENTRY_DSN not set — error tracking disabled");
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.APP_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.1),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_RATE ?? 0.1),
    integrations: [nodeProfilingIntegration()],
  });
  initialized = true;

  // Node-level safety nets so nothing slips through Express.
  process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error("[unhandledRejection]", reason);
    Sentry.captureException(reason);
  });
  process.on("uncaughtException", (err) => {
    // eslint-disable-next-line no-console
    console.error("[uncaughtException]", err);
    Sentry.captureException(err);
    // Allow the event to flush, then exit so the process manager restarts us.
    Sentry.close(2000).finally(() => process.exit(1));
  });
}

/**
 * Manually capture DB / infra errors from places that don't flow through
 * an Express error handler (pool "error" events, cron jobs, worker loops).
 */
export function reportServerError(err: unknown, context: Record<string, unknown> = {}) {
  Sentry.withScope((scope) => {
    scope.setExtras(context as Record<string, unknown>);
    Sentry.captureException(err);
  });
}

/**
 * Express request handler that opens a Sentry scope per request so
 * downstream exceptions carry route/user context.
 */
export const sentryRequestHandler: RequestHandler = (req, _res, next) => {
  Sentry.withScope((scope) => {
    scope.setTag("http.method", req.method);
    scope.setTag("http.route", req.path);
    const userId = (req as { user?: { id?: string } }).user?.id;
    if (userId) scope.setUser({ id: userId });
    next();
  });
};

/**
 * Express error middleware. Mount AFTER routes and BEFORE your JSON
 * error responder. Non-4xx errors are forwarded to Sentry.
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode ??
    500;
  if (status >= 500) Sentry.captureException(err);
  next(err);
};

export { Sentry };
