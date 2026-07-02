// Sentry MUST be initialized before any other module that creates HTTP
// clients, DB pools, or the express app — so its auto-instrumentation can
// patch them at require time.
import { initSentry, sentryRequestHandler, sentryErrorHandler } from "./observability.js";
initSentry();

import express, { Request, Response, ErrorRequestHandler } from "express";
import { createServer } from "http";
import { ZodError } from "zod";
import authRouter from "./routes/auth.js";
import workflowsRouter from "./routes/workflows.js";
import metricsRouter from "./routes/metrics.js";
import revenueSeriesRouter from "./routes/revenue-series.js";
import capacityRouter from "./routes/capacity.js";
import resourceDistributionRouter from "./routes/resource-distribution.js";
import insightsRouter from "./routes/insights.js";
import aiInsightsRouter from "./routes/ai-insights.js";
import usersRouter from "./routes/users.js";
import auditLogsRouter from "./routes/audit-logs.js";
import integrationsRouter from "./routes/integrations.js";
import webhooksRouter from "./routes/webhooks.js";
import billingRouter from "./routes/billing.js";
import billingWebhookRouter from "./routes/billing-webhook.js";
import { attachCollab } from "./collab.js";
import { startAnomalyWatcher } from "./agent/watcher.js";
import { authenticate } from "./auth.js";
import {
  securityHeaders,
  frontendSecurityHeaders,
  strictCors,
  standardLimiter,
  strictLimiter,
  sanitizeInputs,
} from "./security.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";
import { mountFrontend, stopFrontend } from "./frontend.js";
import { runMigrations } from "./migrate.js";

export const app = express();

// Trust the first proxy hop so express-rate-limit sees real client IPs.
app.set("trust proxy", 1);

// API documentation — mounted before helmet's strict CSP and before auth so
// developers can browse the spec. Swagger UI ships its own inline assets.
app.get("/api-docs.json", (_req, res) => res.json(openApiSpec));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, { customSiteTitle: "BI Automation API Docs" }),
);

// Per-request Sentry scope (tags + user), mounted first so every route
// inherits it — including the raw-body webhook routers below.
app.use(sentryRequestHandler);

// Secure HTTP headers + strict CORS + rate limiting on the API surface only.
// The API's locked-down CSP (defaultSrc: 'none') would break the SSR
// frontend mounted below, and the rate limit budget is far too low for a
// page's worth of JS/CSS asset requests.
app.use(["/api", "/health"], securityHeaders);
app.use(["/api", "/health"], strictCors);
app.use(["/api", "/health"], standardLimiter);

// Endpoints that need the raw request body (HMAC / Stripe signature checks)
// MUST be mounted before express.json(). Each uses its own express.raw()
// parser and enforces its own auth per-request. Sensitive → strict limiter.
app.use("/api/webhooks", strictLimiter, webhooksRouter);
app.use("/api/billing/webhook", strictLimiter, billingWebhookRouter);

app.use(express.json({ limit: "1mb" }));
app.use(sanitizeInputs);
app.use(authenticate);

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// Login has no password to slow brute-forcing — stricter limit.
app.use("/api/auth/login", strictLimiter);
app.use("/api/auth", authRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/revenue-series", revenueSeriesRouter);
app.use("/api/capacity", capacityRouter);
app.use("/api/resource-distribution", resourceDistributionRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/ai/insights", aiInsightsRouter);
app.use("/api/users", usersRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/integrations", integrationsRouter);
// Checkout is sensitive — stricter limit than the rest of billing.
app.use("/api/billing/checkout", strictLimiter);
app.use("/api/billing", billingRouter);

// Everything else falls through to the SSR frontend. Skipped in tests so
// they don't spawn the SSR child process as an import side effect.
app.use(frontendSecurityHeaders);
if (process.env.NODE_ENV !== "test") {
  mountFrontend(app);
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", issues: err.issues });
  }
  // eslint-disable-next-line no-console
  console.error("[api] error", err);
  res.status(500).json({ error: "Internal Server Error" });
};
// Report 5xx errors to Sentry BEFORE the JSON responder finalizes them.
app.use(sentryErrorHandler);
app.use(errorHandler);

// HTTP server so Express and Socket.io can share the same port.
export const httpServer = createServer(app);
export const io = attachCollab(httpServer);

const port = Number(process.env.PORT ?? 3001);
if (process.env.NODE_ENV !== "test") {
  await runMigrations();
  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] http + socket.io listening on :${port}`);
  });
  startAnomalyWatcher();

  // Take the SSR child process down with us instead of orphaning it.
  process.on("SIGTERM", stopFrontend);
  process.on("SIGINT", stopFrontend);
}
