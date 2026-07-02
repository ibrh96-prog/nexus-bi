import Stripe from "stripe";
import type { SubscriptionTier } from "../schema.js";

const key = process.env.STRIPE_SECRET_KEY;
if (!key && process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line no-console
  console.warn("[billing] STRIPE_SECRET_KEY not set — /api/billing/* will fail at runtime");
}

export const stripe = new Stripe(key ?? "sk_test_placeholder", {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
  maxNetworkRetries: 2,
});

/**
 * Map Stripe price IDs → internal subscription tier. Populate via env so we
 * never hardcode price IDs. Format: STRIPE_PRICE_MAP="price_xxx:starter,price_yyy:pro"
 */
function parsePriceMap(raw: string | undefined): Record<string, SubscriptionTier> {
  if (!raw) return {};
  const out: Record<string, SubscriptionTier> = {};
  for (const pair of raw.split(",")) {
    const [priceId, tier] = pair.split(":").map((s) => s.trim());
    if (priceId && tier) out[priceId] = tier as SubscriptionTier;
  }
  return out;
}
export const PRICE_TO_TIER = parsePriceMap(process.env.STRIPE_PRICE_MAP);

/** Stripe price ID of the metered AI-token line item (per-subscription add-on). */
export const METERED_AI_TOKENS_PRICE_ID = process.env.STRIPE_METERED_AI_TOKENS_PRICE_ID ?? "";
