import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import {
  billingCustomers,
  stripeEvents,
  usageRecords,
  users,
  type SubscriptionStatus,
  type SubscriptionTier,
} from "../schema.js";
import { PRICE_TO_TIER, METERED_AI_TOKENS_PRICE_ID, stripe } from "./stripe.js";

/**
 * Get or create a Stripe customer for a user. Idempotent.
 */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId))
    .limit(1);
  if (existing) return existing.stripeCustomerId;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("user_not_found");

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId },
  });

  await db.insert(billingCustomers).values({
    userId,
    stripeCustomerId: customer.id,
    tier: "free",
    status: "incomplete",
  });

  return customer.id;
}

/**
 * Extract the (tier, metered-item-id) from a Stripe Subscription. The
 * licensed item drives the tier; a second metered item — if present —
 * is what we report AI-token usage against.
 */
function classifySubscription(sub: Stripe.Subscription): {
  tier: SubscriptionTier;
  priceId: string | null;
  meteredItemId: string | null;
} {
  let tier: SubscriptionTier = "free";
  let priceId: string | null = null;
  let meteredItemId: string | null = null;

  for (const item of sub.items.data) {
    const pid = item.price.id;
    if (pid === METERED_AI_TOKENS_PRICE_ID) {
      meteredItemId = item.id;
      continue;
    }
    const mapped = PRICE_TO_TIER[pid];
    if (mapped) {
      tier = mapped;
      priceId = pid;
    }
  }
  return { tier, priceId, meteredItemId };
}

/**
 * Apply a Stripe subscription snapshot to our DB. Called from webhook
 * handlers for `checkout.session.completed` and `invoice.payment_succeeded`
 * (and any subscription lifecycle event we care about).
 */
export async function upsertSubscriptionFromStripe(
  userId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const { tier, priceId, meteredItemId } = classifySubscription(subscription);
  const status = subscription.status as SubscriptionStatus;
  // Stripe moved billing-period fields from the subscription to its items as of API 2025+.
  const currentPeriodEndSec = subscription.items.data[0]?.current_period_end;

  await db
    .update(billingCustomers)
    .set({
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      stripeMeteredItemId: meteredItemId,
      tier,
      status,
      currentPeriodEnd: currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(billingCustomers.userId, userId));
}

/**
 * Guard against duplicate webhook deliveries. Returns true if this event.id
 * has already been processed.
 */
export async function isDuplicateEvent(eventId: string, type: string): Promise<boolean> {
  try {
    await db.insert(stripeEvents).values({ id: eventId, type });
    return false;
  } catch {
    // unique violation → already processed
    return true;
  }
}

/**
 * Report AI-token usage to Stripe for the user's metered subscription item.
 * Uses a client-side idempotency key so retries never double-bill.
 *
 * Call this from AI code paths after receiving a completion, passing the
 * token total returned by the model provider.
 */
export async function reportAiTokenUsage(params: {
  userId: string;
  tokens: number;
  /** Optional custom idempotency key. Generated when omitted. */
  idempotencyKey?: string;
  /** Unix timestamp (seconds). Defaults to now. */
  timestamp?: number;
}): Promise<{ reported: boolean; reason?: string }> {
  const { userId, tokens } = params;
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return { reported: false, reason: "invalid_quantity" };
  }

  const [billing] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId))
    .limit(1);
  if (!billing?.stripeMeteredItemId) {
    return { reported: false, reason: "no_metered_item" };
  }

  const idempotencyKey = params.idempotencyKey ?? `usage-${userId}-${randomUUID()}`;

  // Insert local record BEFORE the API call so we own the idempotency key even if we crash mid-flight.
  const [record] = await db
    .insert(usageRecords)
    .values({
      userId,
      metric: "ai_tokens",
      quantity: tokens,
      stripeSubscriptionItemId: billing.stripeMeteredItemId,
      stripeIdempotencyKey: idempotencyKey,
    })
    .returning();

  // Stripe removed the old Usage Records API; usage is now reported as meter
  // events keyed by customer, not by subscription item. Configure a Billing
  // Meter in the Stripe dashboard and set its event name via env.
  await stripe.billing.meterEvents.create(
    {
      event_name: process.env.STRIPE_AI_TOKENS_METER_EVENT_NAME ?? "ai_tokens",
      payload: {
        stripe_customer_id: billing.stripeCustomerId,
        value: String(tokens),
      },
      timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
      identifier: idempotencyKey,
    },
    { idempotencyKey },
  );

  await db
    .update(usageRecords)
    .set({ reportedAt: new Date() })
    .where(eq(usageRecords.id, record.id));

  return { reported: true };
}

/** Look up the userId that owns a Stripe customer. */
export async function userIdForStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: billingCustomers.userId })
    .from(billingCustomers)
    .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row?.userId ?? null;
}

// Re-export for convenience.
export { stripe };
export const _internal = { classifySubscription };
