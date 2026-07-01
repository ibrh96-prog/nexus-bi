import type { MappingRule, WorkflowNode } from "../schema";

/**
 * Resolve a dot/bracket path like `data.object.amount` or `items[0].sku`
 * against an arbitrary JSON value. Returns `undefined` when unreachable.
 */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const tokens = path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = source;
  for (const key of tokens) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Assign a value to a dot-path on a plain object (creating intermediate objects). */
export function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const tokens = path.split(".").filter(Boolean);
  if (tokens.length === 0) return;
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const k = tokens[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[tokens[tokens.length - 1]] = value;
}

/** Apply mapping rules to a payload and produce the normalized input object. */
export function applyMapping(payload: unknown, rules: MappingRule[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const rule of rules) {
    const raw = getByPath(payload, rule.source);
    setByPath(out, rule.target, raw === undefined ? rule.default : raw);
  }
  return out;
}

/**
 * Inject the normalized payload into the workflow's start node
 * (`type === "trigger"` or first node) under `data.input`.
 * Returns a new nodes array — never mutates the input.
 */
export function injectIntoStartNode(
  nodes: WorkflowNode[],
  mapped: Record<string, unknown>,
): { nodes: WorkflowNode[]; startNodeId: string | null } {
  if (nodes.length === 0) return { nodes, startNodeId: null };
  const startIdx = Math.max(
    0,
    nodes.findIndex((n) => n.type === "trigger"),
  );
  const start = nodes[startIdx];
  const updated: WorkflowNode = {
    ...start,
    data: {
      ...(start.data ?? {}),
      input: mapped,
      lastTriggeredAt: new Date().toISOString(),
    },
  };
  const next = nodes.slice();
  next[startIdx] = updated;
  return { nodes: next, startNodeId: start.id };
}
