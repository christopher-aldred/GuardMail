/**
 * Stripe billing client.
 *
 * Used for subscription checkout (Hobby & Pro tiers) and webhook-driven
 * tier updates. The Custom tier is handled out-of-band (contact sales).
 *
 * Stripe Products were created in the dashboard with recurring prices;
 * we store the *product* IDs and resolve each product's default price
 * id at checkout time (cached for the process lifetime).
 */
import Stripe from "stripe";
import type { Tier } from "@guardmail/shared";

/** Stripe client. Lazily created so the API server still boots without keys. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

/** True when Stripe billing is configured (env keys present). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Map each billable tier to its Stripe Product ID (set via env). */
const PRODUCT_ID_BY_TIER: Partial<Record<Tier, string | undefined>> = {
  hobby: process.env.STRIPE_HOBBY_PRODUCT_ID,
  pro: process.env.STRIPE_PRO_PRODUCT_ID,
};

/** Whether a tier is billable through Stripe (has a product id). */
export function tierIsBillable(tier: Tier): boolean {
  return Boolean(PRODUCT_ID_BY_TIER[tier]);
}

// Cache resolved price ids per tier for the process lifetime.
const priceIdCache = new Map<Tier, string>();

/**
 * Resolve a tier's Stripe Price ID from its Product ID.
 *
 * The product must have a `default_price` (set automatically when you
 * create a recurring price for the product in the dashboard). Returns
 * null for the Free and Custom tiers (not billable here).
 */
export async function stripePriceIdForTier(
  tier: Tier,
): Promise<string | null> {
  if (tier === "free" || tier === "custom") return null;

  const cached = priceIdCache.get(tier);
  if (cached) return cached;

  const productId = PRODUCT_ID_BY_TIER[tier];
  if (!productId) return null;

  const product = await getStripe().products.retrieve(productId);
  const price =
    typeof product.default_price === "string"
      ? product.default_price
      : (product.default_price?.id ?? null);

  if (price) priceIdCache.set(tier, price);
  return price;
}

/** Web URL to redirect users back to after checkout. */
export const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";