import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { agentActions, workflows, type NewAgentAction } from "../schema.js";

/**
 * Persist an audit-log entry for every tool invocation the autonomous
 * agent performs. Called from each tool wrapper below.
 */
export async function logAgentAction(entry: NewAgentAction): Promise<void> {
  try {
    await db.insert(agentActions).values(entry);
  } catch (err) {
    // Logging must never break the agent loop.
    // eslint-disable-next-line no-console
    console.error("[agent] failed to persist action log", err);
  }
}

type ToolContext = { insightId?: string | null };

/* ------------------------------------------------------------------ */
/* createSupportTicket                                                 */
/* ------------------------------------------------------------------ */
const createSupportTicketSchema = z.object({
  issueDetails: z.object({
    title: z.string().min(3),
    description: z.string().min(5),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    tags: z.array(z.string()).optional(),
  }),
});

export function makeCreateSupportTicketTool(ctx: ToolContext) {
  return tool(
    async ({ issueDetails }) => {
      // Simulated ticketing system side effect.
      const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}`;
      const output = { ticketId, ...issueDetails, createdAt: new Date().toISOString() };

      await logAgentAction({
        insightId: ctx.insightId ?? null,
        tool: "createSupportTicket",
        input: { issueDetails },
        output,
        status: "success",
      });

      return JSON.stringify(output);
    },
    {
      name: "createSupportTicket",
      description:
        "Open a support ticket for an operational issue. Use for medium-severity anomalies that require human triage but not immediate escalation.",
      schema: createSupportTicketSchema,
    },
  );
}

/* ------------------------------------------------------------------ */
/* escalateToHuman                                                     */
/* ------------------------------------------------------------------ */
const escalateToHumanSchema = z.object({
  reason: z.string().min(10),
  severity: z.enum(["high", "critical"]).default("critical"),
  suggestedOwner: z.string().optional(),
});

export function makeEscalateToHumanTool(ctx: ToolContext) {
  return tool(
    async ({ reason, severity, suggestedOwner }) => {
      const escalationId = `ESC-${Date.now().toString(36).toUpperCase()}`;
      const output = {
        escalationId,
        reason,
        severity,
        suggestedOwner: suggestedOwner ?? "on-call-lead",
        notifiedAt: new Date().toISOString(),
      };

      await logAgentAction({
        insightId: ctx.insightId ?? null,
        tool: "escalateToHuman",
        input: { reason, severity, suggestedOwner },
        output,
        status: "success",
      });

      return JSON.stringify(output);
    },
    {
      name: "escalateToHuman",
      description:
        "Escalate a critical anomaly to a human operator. Use only when severity is critical or when automated remediation is not safe.",
      schema: escalateToHumanSchema,
    },
  );
}

/* ------------------------------------------------------------------ */
/* updateWorkflowNodeData                                              */
/* ------------------------------------------------------------------ */
const updateWorkflowNodeDataSchema = z.object({
  workflowId: z.string().uuid().optional(),
  nodeId: z.string().min(1),
  newParams: z.record(z.string(), z.unknown()),
});

export function makeUpdateWorkflowNodeDataTool(ctx: ToolContext) {
  return tool(
    async ({ workflowId, nodeId, newParams }) => {
      // Locate the workflow containing the node.
      const [wf] = workflowId
        ? await db.select().from(workflows).where(eq(workflows.id, workflowId)).limit(1)
        : await db
            .select()
            .from(workflows)
            .where(sql`${workflows.nodes} @> ${JSON.stringify([{ id: nodeId }])}::jsonb`)
            .limit(1);

      if (!wf) {
        const errorPayload = { error: "workflow_not_found", nodeId };
        await logAgentAction({
          insightId: ctx.insightId ?? null,
          tool: "updateWorkflowNodeData",
          input: { workflowId, nodeId, newParams },
          status: "error",
          error: "workflow_not_found",
        });
        return JSON.stringify(errorPayload);
      }

      const nextNodes = wf.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...(n.data ?? {}), ...newParams } } : n,
      );
      const changed = nextNodes.some((n, i) => n !== wf.nodes[i]);

      if (!changed) {
        const payload = { error: "node_not_found", nodeId, workflowId: wf.id };
        await logAgentAction({
          insightId: ctx.insightId ?? null,
          tool: "updateWorkflowNodeData",
          input: { workflowId, nodeId, newParams },
          status: "error",
          error: "node_not_found",
        });
        return JSON.stringify(payload);
      }

      await db
        .update(workflows)
        .set({ nodes: nextNodes, updatedAt: new Date() })
        .where(eq(workflows.id, wf.id));

      const output = { workflowId: wf.id, nodeId, appliedParams: newParams };
      await logAgentAction({
        insightId: ctx.insightId ?? null,
        tool: "updateWorkflowNodeData",
        input: { workflowId, nodeId, newParams },
        output,
        status: "success",
      });

      return JSON.stringify(output);
    },
    {
      name: "updateWorkflowNodeData",
      description:
        "Patch the `data` params of a specific workflow node to auto-remediate a bottleneck (e.g. lower a threshold, raise a rate limit). Prefer this for medium anomalies that map to a known workflow node.",
      schema: updateWorkflowNodeDataSchema,
    },
  );
}

export function buildToolset(ctx: ToolContext) {
  return [
    makeCreateSupportTicketTool(ctx),
    makeEscalateToHumanTool(ctx),
    makeUpdateWorkflowNodeDataTool(ctx),
  ];
}
