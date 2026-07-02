import { createHmac, timingSafeEqual } from "crypto";
import type { SignatureScheme } from "../schema.js";

/** Constant-time hex compare — never leaks timing info. */
function safeHexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type SignatureVerification = {
  ok: boolean;
  reason?: string;
};

/**
 * Verify an incoming webhook signature against the raw request body.
 * `rawBody` MUST be the exact bytes received (no re-serialization).
 */
export function verifySignature(params: {
  scheme: SignatureScheme;
  header: string | null;
  secret: string | null;
  rawBody: Buffer;
}): SignatureVerification {
  const { scheme, header, secret, rawBody } = params;

  if (scheme === "none") return { ok: true };
  if (!secret) return { ok: false, reason: "signing_secret_missing" };
  if (!header) return { ok: false, reason: "signature_header_missing" };

  if (scheme === "github" || scheme === "hmac-sha256") {
    // GitHub: "sha256=<hex>". Plain hmac-sha256: bare hex.
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = header.startsWith("sha256=") ? header.slice(7) : header;
    return safeHexEqual(expected, provided)
      ? { ok: true }
      : { ok: false, reason: "signature_mismatch" };
  }

  if (scheme === "stripe") {
    // Stripe: "t=<ts>,v1=<hex>[,v1=<hex>...]"
    const parts = header.split(",").map((p) => p.trim());
    const ts = parts.find((p) => p.startsWith("t="))?.slice(2);
    const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    if (!ts || sigs.length === 0) return { ok: false, reason: "signature_malformed" };

    // Reject replays older than 5 minutes.
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      return { ok: false, reason: "signature_stale" };
    }
    const signedPayload = Buffer.concat([Buffer.from(`${ts}.`), rawBody]);
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    return sigs.some((s) => safeHexEqual(expected, s))
      ? { ok: true }
      : { ok: false, reason: "signature_mismatch" };
  }

  return { ok: false, reason: "unknown_scheme" };
}
