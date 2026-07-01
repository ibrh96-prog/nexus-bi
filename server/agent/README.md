# Autonomous Agent Layer

LangChain + OpenAI function-calling agent that reacts to critical entries in
the `ai_insights` table.

## Files

- `tools.ts` — three strictly-typed tools (Zod schemas):
  - `createSupportTicket(issueDetails)`
  - `escalateToHuman(reason)`
  - `updateWorkflowNodeData(nodeId, newParams)`
    Each tool writes to the `agent_actions` audit table.
- `agent.ts` — builds a `ChatOpenAI` (`gpt-4o` by default) + `createAgent`
  loop with a severity-aware system prompt.
- `watcher.ts` — `node-cron` job that polls `ai_insights` every minute for
  `type='anomaly'` + `status='pending'` + severity in (`high`,`critical`),
  invokes the agent, and marks the row `handled`.

## Environment

| Var                     | Purpose                   | Default       |
| ----------------------- | ------------------------- | ------------- |
| `OPENAI_API_KEY`        | model auth                | required      |
| `OPENAI_MODEL`          | override model            | `gpt-4o`      |
| `AGENT_WATCHER_CRON`    | poll schedule             | `*/1 * * * *` |
| `AGENT_WATCHER_ENABLED` | set to `false` to disable | `true`        |

## Schema additions

`drizzle-kit generate && drizzle-kit push` picks up:

- `ai_insights.severity` (`low|medium|high|critical`, default `low`)
- `ai_insights.context` (`jsonb`)
- `ai_insights.status` now includes `handled`
- new `agent_actions` audit table
