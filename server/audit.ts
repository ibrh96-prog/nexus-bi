import { createHash } from "crypto";
import { desc, eq } from "drizzle-orm";
import type { Request } from "express";
import { db } from "./db";
import { auditLogs, type NewAuditLog } from "./schema";

const GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

async function latestHash(): Promise<string> {
  const [row] = await db
    .select({ rowHash: auditLogs.rowHash })
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp))
    .limit(1);
  return row?.rowHash ?? GENESIS_HASH;
}

export type AuditParams = {
  userId?: string | null;
  action: "create" | "update" | "delete" | (string & {});
  resourceType: string;
  resourceId?: string | null;
  payload: Record<string, unknown>;
};

/**
 * Append an immutable, hash-chained audit-log record. Each row's `row_hash`
 * is `sha256(prev_hash || canonicalJSON(entry))`, so any retroactive edit
 * breaks the chain and is detectable via `verifyAuditChain()`.
 */
export async function recordAudit(params: AuditParams): Promise<void> {
  const prevHash = await latestHash();
  const timestamp = new Date();
  const body = {
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    payload: params.payload,
    timestamp: timestamp.toISOString(),
  };
  const rowHash = createHash("sha256")
    .update(prevHash + canonicalize(body))
    .digest("hex");

  const entry: NewAuditLog = {
    userId: body.userId,
    action: body.action,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    payload: body.payload,
    prevHash,
    rowHash,
    timestamp,
  };
  await db.insert(auditLogs).values(entry);
}

/** Convenience: derive the actor id from `req.user` set by `authenticate`. */
export function auditFromRequest(req: Request, params: Omit<AuditParams, "userId">): Promise<void> {
  return recordAudit({ ...params, userId: req.user?.id ?? null });
}

/** Walk the whole chain to detect tampering. */
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAt?: string }> {
  const rows = await db.select().from(auditLogs).orderBy(auditLogs.timestamp);
  let expectedPrev = GENESIS_HASH;
  for (const r of rows) {
    if (r.prevHash !== expectedPrev) return { ok: false, brokenAt: r.id };
    const body = {
      userId: r.userId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      payload: r.payload,
      timestamp: r.timestamp.toISOString(),
    };
    const hash = createHash("sha256")
      .update(r.prevHash + canonicalize(body))
      .digest("hex");
    if (hash !== r.rowHash) return { ok: false, brokenAt: r.id };
    expectedPrev = r.rowHash;
  }
  return { ok: true };
}

export { eq };
