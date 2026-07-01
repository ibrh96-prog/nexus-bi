import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* users + role enum                                                   */
/* ------------------------------------------------------------------ */
export const userRoles = ["admin", "editor", "viewer"] as const;
export type UserRole = (typeof userRoles)[number];
export const userRoleEnum = pgEnum("user_role", userRoles);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* workflows                                                           */
/* ------------------------------------------------------------------ */
export type WorkflowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
};
export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nodes: jsonb("nodes")
      .$type<WorkflowNode[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    edges: jsonb("edges")
      .$type<WorkflowEdge[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("workflows_user_id_idx").on(t.userId),
  }),
);

/* ------------------------------------------------------------------ */
/* metrics                                                             */
/* ------------------------------------------------------------------ */
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revenue: numeric("revenue", { precision: 14, scale: 2 }).notNull(),
    activeWorkflows: integer("active_workflows").notNull(),
    predictedChurn: numeric("predicted_churn", { precision: 5, scale: 4 }).notNull(),
    averageResolutionTime: integer("average_resolution_time").notNull(), // seconds
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recordedIdx: index("metrics_recorded_at_idx").on(t.recordedAt),
  }),
);

/* ------------------------------------------------------------------ */
/* ai_insights                                                         */
/* ------------------------------------------------------------------ */
export const insightTypes = ["anomaly", "recommendation"] as const;
export type InsightType = (typeof insightTypes)[number];

export const insightStatuses = ["pending", "resolved", "handled"] as const;
export type InsightStatus = (typeof insightStatuses)[number];

export const insightSeverities = ["low", "medium", "high", "critical"] as const;
export type InsightSeverity = (typeof insightSeverities)[number];

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<InsightType>().notNull(),
    severity: text("severity").$type<InsightSeverity>().notNull().default("low"),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    status: text("status").$type<InsightStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("ai_insights_status_idx").on(t.status),
    severityIdx: index("ai_insights_severity_idx").on(t.severity),
  }),
);

/* ------------------------------------------------------------------ */
/* agent_actions — audit log of autonomous agent tool executions       */
/* ------------------------------------------------------------------ */
export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    insightId: uuid("insight_id").references(() => aiInsights.id, {
      onDelete: "set null",
    }),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("success"), // success | error
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    insightIdx: index("agent_actions_insight_id_idx").on(t.insightId),
    createdIdx: index("agent_actions_created_at_idx").on(t.createdAt),
  }),
);

/* ------------------------------------------------------------------ */
/* relations                                                           */
/* ------------------------------------------------------------------ */
export const usersRelations = relations(users, ({ many }) => ({
  workflows: many(workflows),
}));

export const workflowsRelations = relations(workflows, ({ one }) => ({
  user: one(users, { fields: [workflows.userId], references: [users.id] }),
}));

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  insight: one(aiInsights, {
    fields: [agentActions.insightId],
    references: [aiInsights.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* audit_logs — append-only, hash-chained                              */
/* ------------------------------------------------------------------ */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // create | update | delete
    resourceType: text("resource_type").notNull(), // workflow | metric | user | ...
    resourceId: uuid("resource_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    rowHash: text("row_hash").notNull().unique(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("audit_logs_user_id_idx").on(t.userId),
    resourceIdx: index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
    timestampIdx: index("audit_logs_timestamp_idx").on(t.timestamp),
  }),
);

/* ------------------------------------------------------------------ */
/* integrations — dynamic webhook credentials + mapping rules          */
/* ------------------------------------------------------------------ */
export const signatureSchemes = ["none", "github", "stripe", "hmac-sha256"] as const;
export type SignatureScheme = (typeof signatureSchemes)[number];

/**
 * A MappingRule copies a value from the incoming payload into the workflow
 * start-node's input under `target`. `source` is a dot/bracket path
 * (e.g. `data.object.amount` or `items[0].sku`). `default` is used when the
 * path resolves to undefined.
 */
export type MappingRule = {
  source: string;
  target: string;
  default?: unknown;
};

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull().default("custom"), // stripe | github | custom | ...
    secret: text("secret").notNull().unique(), // URL segment; identifies the integration
    signatureScheme: text("signature_scheme").$type<SignatureScheme>().notNull().default("none"),
    signatureHeader: text("signature_header"), // e.g. X-Hub-Signature-256, Stripe-Signature
    signingSecret: text("signing_secret"), // HMAC key for signature verification
    mappingRules: jsonb("mapping_rules")
      .$type<MappingRule[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    enabled: text("enabled").notNull().default("true"), // "true"/"false" as text for simple toggling
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("integrations_user_id_idx").on(t.userId),
    workflowIdx: index("integrations_workflow_id_idx").on(t.workflowId),
  }),
);

/* ------------------------------------------------------------------ */
/* workflow_runs — one row per webhook-triggered workflow execution    */
/* ------------------------------------------------------------------ */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    sourceIp: text("source_ip"),
    rawPayload: jsonb("raw_payload").$type<unknown>(),
    mappedPayload: jsonb("mapped_payload").$type<Record<string, unknown>>(),
    status: text("status").notNull(), // received | rejected | dispatched | failed
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workflowIdx: index("workflow_runs_workflow_id_idx").on(t.workflowId),
    createdIdx: index("workflow_runs_created_at_idx").on(t.createdAt),
  }),
);

/* ------------------------------------------------------------------ */
/* billing — Stripe subscription + metered usage records               */
/* ------------------------------------------------------------------ */
export const subscriptionTiers = ["free", "starter", "pro", "enterprise"] as const;
export type SubscriptionTier = (typeof subscriptionTiers)[number];
export const subscriptionTierEnum = pgEnum("subscription_tier", subscriptionTiers);

export const subscriptionStatuses = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export const subscriptionStatusEnum = pgEnum("subscription_status", subscriptionStatuses);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull().unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    /** Stripe price ID currently attached to the licensed (flat) subscription item. */
    stripePriceId: text("stripe_price_id"),
    /** Stripe subscription item ID for the metered AI-token price (used to report usage). */
    stripeMeteredItemId: text("stripe_metered_item_id"),
    tier: subscriptionTierEnum("tier").notNull().default("free"),
    status: subscriptionStatusEnum("status").notNull().default("incomplete"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tierIdx: index("billing_customers_tier_idx").on(t.tier),
  }),
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Metric key, e.g. "ai_tokens". Kept generic so we can report other meters later. */
    metric: text("metric").notNull(),
    quantity: integer("quantity").notNull(),
    /** Stripe subscription item this usage was reported against. */
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    /** Stripe returns nothing durable for a usage record; store the request idempotency key. */
    stripeIdempotencyKey: text("stripe_idempotency_key").unique(),
    /** null until Stripe accepts the report. */
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userMetricIdx: index("usage_records_user_metric_idx").on(t.userId, t.metric),
    createdIdx: index("usage_records_created_at_idx").on(t.createdAt),
  }),
);

/** Idempotency guard: never process the same Stripe event twice. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(), // Stripe event.id
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type AiInsight = typeof aiInsights.$inferSelect;
export type NewAiInsight = typeof aiInsights.$inferInsert;
export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type NewBillingCustomer = typeof billingCustomers.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
