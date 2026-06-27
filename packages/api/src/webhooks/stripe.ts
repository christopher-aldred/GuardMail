/**
 * Stripe billing webhook.
 *
 * Stripe sends lifecycle events here (checkout completed, subscription
 * canceled, payment failed, …). The webhook signature MUST be verified
 * with the raw request body before any processing — never trust the
 * client, and only this webhook updates a user's `tier` in the DB.
 *
 * Configure the endpoint in the Stripe dashboard (Developers → Webhooks)
 * pointing at https://<api-domain>/api/webhooks/stripe, subscribing to
 * at least:
 *   - checkout.session.completed
 *   - customer.subscription.deleted
 *   - customer.subscription.updated
 * and copy the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * For local development use the Stripe CLI:
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import Stripe from "stripe";
import type { ApiResponse } from "@guardmail/shared";
import { getStripe } from "../services/stripe";
import { userRepository } from "../db";

interface StripeWebhookEnv {
  Variables: { stripeEvent: Stripe.Event };
}

export const stripeWebhookRoutes = new Hono<StripeWebhookEnv>();

// Cache the raw body between the auth middleware and the route handler
// (mirrors the Resend webhook pattern). Stripe signature verification
// requires the exact raw bytes before JSON parsing.
let cachedRawBody: string | null = null;

/** Auth guard — verify the Stripe-Signature header over the raw body. */
stripeWebhookRoutes.use("*", async (c, next) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new HTTPException(503, { message: "STRIPE_WEBHOOK_SECRET not configured" });
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    throw new HTTPException(401, { message: "Missing stripe-signature header" });
  }

  cachedRawBody = await c.req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      cachedRawBody,
      signature,
      secret,
    );
  } catch (err) {
    console.warn("[stripe-webhook] Invalid signature:", err instanceof Error ? err.message : err);
    throw new HTTPException(401, { message: "Invalid webhook signature" });
  }

  // Stash the verified event for the handler (avoids re-parsing).
  c.set("stripeEvent", event);
  await next();
});

/**
 * Apply a tier change to a user, looking up the user id from the event
 * metadata (preferred) or via the Stripe customer object.
 */
async function applyTier(
  userId: string | undefined,
  tier: "free" | "hobby" | "pro" | "custom",
) {
  if (!userId) {
    console.warn(`[stripe-webhook] No userId metadata — cannot set tier ${tier}`);
    return;
  }
  const user = await userRepository.findById(userId);
  if (!user) {
    console.warn(`[stripe-webhook] User ${userId} not found — ignoring tier ${tier}`);
    return;
  }
  await userRepository.updateTier(userId, tier);
  console.log(`[stripe-webhook] Updated user ${user.username} → tier=${tier}`);
}

// POST /api/webhooks/stripe
stripeWebhookRoutes.post("/", async (c) => {
  const event = c.get("stripeEvent") as Stripe.Event;
  cachedRawBody = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tier = (session.metadata?.tier ?? "free") as "free" | "hobby" | "pro" | "custom";
      const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
      await applyTier(userId, tier);
      break;
    }

    case "customer.subscription.updated": {
      // Handles plan upgrades/downgrades between Hobby ↔ Pro. The active
      // subscription's price maps back to a tier via the product metadata.
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      const tier = await tierFromSubscription(sub);
      await applyTier(userId, tier);
      break;
    }

    case "customer.subscription.deleted": {
      // Cancellation (voluntary or after failed-payment dunning) → free.
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      await applyTier(userId, "free");
      break;
    }

    case "invoice.payment_failed": {
      // Logged only — Stripe's automatic dunning retries; final failure
      // surfaces as customer.subscription.deleted above.
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(
        `[stripe-webhook] Payment failed for customer ${invoice.customer ?? "?"}`,
      );
      break;
    }

    default:
      // Unhandled event types are acknowledged so Stripe stops retrying.
      break;
  }

  const body: ApiResponse<{ received: boolean }> = {
    success: true,
    data: { received: true },
  };
  return c.json(body);
});

/**
 * Map a subscription's current price back to a Guardmail tier using the
 * cached product→tier lookup. Falls back to the tier stored in the
 * subscription metadata (set at checkout time).
 */
async function tierFromSubscription(
  sub: Stripe.Subscription,
): Promise<"free" | "hobby" | "pro" | "custom"> {
  // Prefer metadata we set during checkout.
  if (sub.metadata?.tier) {
    return sub.metadata.tier as "free" | "hobby" | "pro" | "custom";
  }
  // Otherwise inspect the active item's price → product id.
  const item = sub.items.data[0];
  const price = item?.price;
  const productId =
    typeof price?.product === "string" ? price.product : price?.product?.id;
  if (productId === process.env.STRIPE_HOBBY_PRODUCT_ID) return "hobby";
  if (productId === process.env.STRIPE_PRO_PRODUCT_ID) return "pro";
  return "free";
}