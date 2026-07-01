import { Router, type Request, type Response } from "express";
import express from "express";
import type Stripe from "stripe";
import { stripe } from "../billing/stripe";
import {
  isDuplicateEvent,
  upsertSubscriptionFromStripe,
  userIdForStripeCustomer,
} from "../billing/service";

/**
 * Stripe -> our server. MUST be mounted before express.json() so signature
 * verification sees the exact bytes Stripe signed.
 */
const router = Router();

const webhookRawParser = express.raw({ type: "application/json", limit: "1mb" });

router.post("/", webhookRawParser, async (req: Request, res: Response) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret || typeof signature !== "string") {
    return res.status(400).send("missing_signature_or_secret");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (err) {
    return res.status(400).send(`invalid_signature: ${(err as Error).message}`);
  }

  if (await isDuplicateEvent(event.id, event.type)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.client_reference_id ??
          (typeof session.customer === "string"
            ? await userIdForStripeCustomer(session.customer)
            : null);
        if (!userId || !session.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await upsertSubscriptionFromStripe(userId, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription || typeof invoice.customer !== "string") break;
        const userId = await userIdForStripeCustomer(invoice.customer);
        if (!userId) break;
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string,
        );
        await upsertSubscriptionFromStripe(userId, subscription);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing:webhook] handler error", { type: event.type, err });
    return res.status(500).send("handler_error");
  }

  res.json({ received: true });
});

export default router;
