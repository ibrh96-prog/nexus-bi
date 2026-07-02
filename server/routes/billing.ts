import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type Stripe from "stripe";
import { requireAnyRole } from "../auth.js";
import { stripe } from "../billing/stripe.js";
import { ensureStripeCustomer } from "../billing/service.js";

const router = Router();

/* ------------------------------------------------------------------ */
/* POST /api/billing/checkout                                          */
/* Create a Stripe Checkout Session for a subscription.                */
/* ------------------------------------------------------------------ */
const checkoutSchema = z.object({
  priceId: z.string().min(1).max(120),
  /** Optional add-on metered price (e.g. AI tokens). Attached with no quantity. */
  meteredPriceId: z.string().min(1).max(120).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/checkout", requireAnyRole, async (req: Request, res: Response) => {
  const body = checkoutSchema.parse(req.body);
  const userId = req.user!.id;
  const customerId = await ensureStripeCustomer(userId);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: body.priceId, quantity: 1 },
  ];
  if (body.meteredPriceId) {
    // Metered items are attached without a quantity — Stripe rejects one here.
    lineItems.push({ price: body.meteredPriceId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    // Echo userId back so the webhook can correlate without a customer lookup.
    client_reference_id: userId,
    subscription_data: { metadata: { userId } },
    allow_promotion_codes: true,
  });

  res.json({ id: session.id, url: session.url });
});

export default router;
