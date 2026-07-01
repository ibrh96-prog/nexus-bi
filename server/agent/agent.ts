import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildToolset, logAgentAction } from "./tools";
import type { AiInsight } from "../schema";

const SYSTEM_PROMPT = `You are the Autonomous Operations Agent for an enterprise BI platform.
You receive an anomaly detected in production metrics and must decide which
single tool to execute to remediate it. Follow these rules strictly:

- severity=critical  → call escalateToHuman (never auto-remediate).
- severity=high      → call escalateToHuman AND, if a workflow node is clearly
                       implicated, updateWorkflowNodeData; otherwise createSupportTicket.
- severity=medium    → prefer updateWorkflowNodeData when a node is implicated,
                       otherwise createSupportTicket.
- severity=low       → createSupportTicket with priority=low.

Always justify your choice in a final short message. Never invent nodeIds or
workflowIds that were not provided in the context.`;

export type AgentRunResult = {
  insightId: string;
  finalMessage: string;
  toolCalls: Array<{ name: string; args: unknown }>;
};

export async function runAgentForInsight(insight: AiInsight): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0,
  });

  const tools = buildToolset({ insightId: insight.id });
  const agent = createAgent({ model, tools });

  const humanContent = [
    `Anomaly ID: ${insight.id}`,
    `Type: ${insight.type}`,
    `Severity: ${insight.severity}`,
    `Message: ${insight.message}`,
    insight.context ? `Context: ${JSON.stringify(insight.context)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await agent.invoke({
      messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(humanContent)],
    });

    const messages = (result as { messages: Array<Record<string, unknown>> }).messages ?? [];
    const finalMessage =
      typeof messages.at(-1)?.content === "string"
        ? (messages.at(-1)!.content as string)
        : JSON.stringify(messages.at(-1)?.content ?? "");

    const toolCalls: AgentRunResult["toolCalls"] = [];
    for (const m of messages) {
      const calls = (m as { tool_calls?: Array<{ name: string; args: unknown }> }).tool_calls;
      if (Array.isArray(calls)) toolCalls.push(...calls.map((c) => ({ name: c.name, args: c.args })));
    }

    return { insightId: insight.id, finalMessage, toolCalls };
  } catch (err) {
    await logAgentAction({
      insightId: insight.id,
      tool: "__agent__",
      input: { severity: insight.severity, message: insight.message },
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
