/**
 * Spam filter settings routes.
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { v4 as uuid } from 'uuid';
import type { ApiResponse, CustomDomainInfo, SpamFilterConfig, SubscriptionInfo, Tier, SecuritySettings } from '@guardmail/shared';
import { TIERS, tierAllowsCustomDomain, isTier } from '@guardmail/shared';
import type { AuthEnv } from '../middleware/auth';
import { spamFilterConfigRepository, userRepository, emailRepository } from '../db';
import { spamSettingsSchema, customDomainSchema, securitySettingsSchema } from '../auth/schemas';
import {
  resendDomainsClient,
  isResendConfigured,
  ResendNotConfiguredError,
} from '../services/resend-domains';
import {
  getStripe,
  isStripeConfigured,
  stripePriceIdForTier,
  tierIsBillable,
  WEB_URL,
} from '../services/stripe';

export const settingsRoutes = new Hono<AuthEnv>();

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? 'mydomain.com';

/** Build a CustomDomainInfo snapshot from a user row. */
function toDomainInfo(row: {
  customDomain?: string | null;
  customDomainStatus?: string | null;
  customDomainResendId?: string | null;
  customDomainRecords?: import('@guardmail/shared').ResendDomainRecord[] | null;
  customDomainVerifiedAt?: Date | null;
  updatedAt?: Date | null;
}): CustomDomainInfo | null {
  if (!row.customDomain) return null;
  return {
    domain: row.customDomain,
    status: (row.customDomainStatus as CustomDomainInfo['status']) ?? 'pending',
    resendId: row.customDomainResendId ?? null,
    records: row.customDomainRecords ?? null,
    verifiedAt: row.customDomainVerifiedAt ?? null,
    createdAt: row.updatedAt ?? null,
  };
}


function toPublic(row: {
  userId: string;
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high' | 'custom';
  allowlist: string[];
  blocklist: string[];
  keywordRules: { keyword: string; action: 'flag' | 'block'; score: number }[];
  blockContentTypes: string[];
  updatedAt: Date;
}): SpamFilterConfig {
  return {
    userId: row.userId,
    enabled: row.enabled,
    sensitivity: row.sensitivity,
    allowlist: row.allowlist,
    blocklist: row.blocklist,
    keywordRules: row.keywordRules,
    blockContentTypes: row.blockContentTypes,
    updatedAt: row.updatedAt,
  };
}

// GET /api/settings/spam
settingsRoutes.get('/spam', async (c) => {
  const auth = c.get('auth');
  let row = await spamFilterConfigRepository.findByUser(auth.user.id);
  if (!row) row = await spamFilterConfigRepository.createDefault(auth.user.id);
  const body: ApiResponse<SpamFilterConfig> = { success: true, data: toPublic(row) };
  return c.json(body);
});

// PUT /api/settings/spam
settingsRoutes.put('/spam', async (c) => {
  const auth = c.get('auth');
  const parsed = spamSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }

  const existing = await spamFilterConfigRepository.findByUser(auth.user.id);
  const row = existing
    ? await spamFilterConfigRepository.update(auth.user.id, parsed.data)
    : await spamFilterConfigRepository.create({ userId: auth.user.id, ...parsed.data });

  const body: ApiResponse<SpamFilterConfig> = { success: true, data: toPublic(row!) };
  return c.json(body);
});

// GET /api/settings/security
// Per-user outbound LLM Guard toggle. When false, outbound (sent) emails
// skip the LLM Guard prompt-injection / toxicity scan; inbound scanning
// is always on.
settingsRoutes.get('/security', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const data: SecuritySettings = {
    llmGuardOutboundEnabled: user.llmGuardOutboundEnabled ?? true,
  };
  const body: ApiResponse<SecuritySettings> = { success: true, data };
  return c.json(body);
});

// PUT /api/settings/security
settingsRoutes.put('/security', async (c) => {
  const auth = c.get('auth');
  const parsed = securitySettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const user = await userRepository.setLlmGuardOutboundEnabled(
    auth.user.id,
    parsed.data.llmGuardOutboundEnabled,
  );
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const data: SecuritySettings = {
    llmGuardOutboundEnabled: user.llmGuardOutboundEnabled ?? true,
  };
  const body: ApiResponse<SecuritySettings> = { success: true, data };
  return c.json(body);
});

// GET /api/settings/subscription
settingsRoutes.get('/subscription', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const tier = TIERS[(user.tier ?? 'free') as keyof typeof TIERS] ?? TIERS.free;
  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const startOfDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const emailVerified = !!user.emailVerifiedAt;
  // Unverified Free accounts are capped at a lifetime outbound total
  // (default 100) — surface that so the settings page can show the
  // real, reduced limit instead of the full Free allowance.
  const UNVERIFIED_LIFETIME_LIMIT = Number(process.env.UNVERIFIED_SEND_LIMIT ?? 100);
  const isUnverifiedFree = !emailVerified && (user.tier ?? 'free') === 'free';
  const [sentThisMonth, sentToday, sentLifetimeOutbound] = await Promise.all([
    emailRepository.countByUser(user.id, startOfMonth),
    emailRepository.countByUser(user.id, startOfDay),
    isUnverifiedFree ? emailRepository.countOutboundByUser(user.id) : Promise.resolve(0),
  ]);
  const info: SubscriptionInfo = {
    tier: tier.id,
    name: tier.name,
    monthlyLimit: tier.monthlyLimit,
    dailyLimit: tier.dailyLimit,
    priceCents: tier.priceCents,
    available: tier.available,
    sentThisMonth,
    sentToday,
    emailVerified,
    email: user.email,
    unverifiedSendLimit: isUnverifiedFree ? UNVERIFIED_LIFETIME_LIMIT : null,
    sentLifetimeOutbound,
  };
  const body: ApiResponse<SubscriptionInfo> = { success: true, data: info };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// Billing (Stripe Checkout + Customer Portal)
// ---------------------------------------------------------------------------
//
// Hobby (£25/mo) and Pro (£50/mo) are sold as Stripe subscriptions. We
// use Stripe Hosted Checkout (non-embedded) so Stripe owns the card form,
// 3DS/SCA, and receipts. The user is redirected to Stripe's checkout
// page, then back to /settings. The actual tier change happens in the
// Stripe webhook (webhooks/stripe.ts), never on the client.

// POST /api/settings/billing/checkout  { tier: "hobby" | "pro" }
settingsRoutes.post('/billing/checkout', async (c) => {
  const auth = c.get('auth');
  const { tier } = await c.req.json().catch(() => ({ tier: '' }));
  if (!isTier(tier) || !tierIsBillable(tier)) {
    throw new HTTPException(400, { message: 'Invalid or non-billable tier' });
  }
  if (!isStripeConfigured()) {
    throw new HTTPException(503, { message: 'Billing is not configured on the server yet.' });
  }

  const priceId = await stripePriceIdForTier(tier);
  if (!priceId) {
    throw new HTTPException(502, { message: `No Stripe price found for the ${tier} plan.` });
  }

  // Look up the full user record so we can pass the real email as the
  // checkout customer email (and reuse an existing Stripe customer).
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // Link the session back to our DB user for the webhook.
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: { userId: user.id, tier },
    subscription_data: { metadata: { userId: user.id, tier } },
    success_url: `${WEB_URL}/app/inbox?billing=success`,
    cancel_url: `${WEB_URL}/app/settings?billing=cancelled`,
  });

  const body: ApiResponse<{ url: string }> = { success: true, data: { url: session.url ?? '' } };
  return c.json(body);
});

// POST /api/settings/billing/portal
// Opens the Stripe Customer Portal so the user can manage their
// subscription (cancel, change plan, update card). Requires a Stripe
// customer id, which we resolve from the user's checkout/subscription
// metadata; if none exists yet the request 409s.
settingsRoutes.post('/billing/portal', async (c) => {
  const auth = c.get('auth');
  if (!isStripeConfigured()) {
    throw new HTTPException(503, { message: 'Billing is not configured on the server yet.' });
  }
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  const stripe = getStripe();
  // Find the customer by email (the email used at checkout).
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  const customerId = customers.data[0]?.id;
  if (!customerId) {
    throw new HTTPException(409, { message: 'No active subscription found for your account.' });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${WEB_URL}/app/settings`,
  });

  const body: ApiResponse<{ url: string }> = { success: true, data: { url: portal.url } };
  return c.json(body);
});

// GET /api/settings/api-key
settingsRoutes.get('/api-key', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const body: ApiResponse<{ apiKey: string | null }> = {
    success: true,
    data: { apiKey: user.apiKey ?? null },
  };
  return c.json(body);
});

// POST /api/settings/api-key/regenerate
settingsRoutes.post('/api-key/regenerate', async (c) => {
  const auth = c.get('auth');
  const newKey = uuid();
  await userRepository.setApiKey(auth.user.id, newKey);
  const body: ApiResponse<{ apiKey: string }> = {
    success: true,
    data: { apiKey: newKey },
  };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// Custom domain (hobby + pro + custom tiers only)
// ---------------------------------------------------------------------------
//
// Associating a custom domain lets a user send and receive mail from
// <username>@<their-domain> instead of <username>@<default-domain>.
// Domain ownership is verified through Resend's DNS-verification flow:
// we register the domain with Resend, return the DNS records the user
// must publish, and only switch the custom email address once Resend
// reports the domain as verified.

// GET /api/settings/domain
settingsRoutes.get('/domain', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const info = toDomainInfo(user);
  const body: ApiResponse<CustomDomainInfo | null> = { success: true, data: info };
  return c.json(body);
});

// POST /api/settings/domain
settingsRoutes.post('/domain', async (c) => {
  const auth = c.get('auth');
  const parsed = customDomainSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? 'Invalid domain',
    });
  }
  const { domain } = parsed.data;

  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  // Tier gate — only hobby / pro / custom can associate a custom domain.
  if (!tierAllowsCustomDomain((user.tier ?? 'free') as Tier)) {
    throw new HTTPException(403, {
      message:
        'Custom domains are available on the Hobby, Pro, and Custom plans. Upgrade to associate a domain.',
    });
  }

  // Reject the platform's default domain — no point "branding" onto it.
  if (domain === EMAIL_DOMAIN.toLowerCase()) {
    throw new HTTPException(400, {
      message: `That is already the default domain (${EMAIL_DOMAIN}). Choose your own domain.`,
    });
  }

  // Prevent two accounts from claiming the same domain.
  const existing = await userRepository.findByCustomDomain(domain);
  if (existing && existing.id !== user.id) {
    throw new HTTPException(409, {
      message: 'That domain is already associated with another account.',
    });
  }

  if (!isResendConfigured()) {
    throw new HTTPException(503, {
      message: 'Domain verification is not configured on the server yet.',
    });
  }

  // If the user already has a pending/verified domain, remove it from
  // Resend before registering the new one.
  if (user.customDomainResendId) {
    await resendDomainsClient.remove(user.customDomainResendId);
  }

  let created;
  try {
    created = await resendDomainsClient.create(domain);
  } catch (err) {
    if (err instanceof ResendNotConfiguredError) {
      throw new HTTPException(503, { message: err.message });
    }
    throw new HTTPException(502, {
      message: err instanceof Error ? err.message : 'Resend domain registration failed',
    });
  }

  await userRepository.setCustomDomain(
    user.id,
    created.name,
    created.id,
    created.records,
  );

  const info: CustomDomainInfo = {
    domain: created.name,
    status: 'pending',
    resendId: created.id,
    records: created.records,
    verifiedAt: null,
    createdAt: new Date(),
  };
  const body: ApiResponse<CustomDomainInfo> = { success: true, data: info };
  return c.json(body, 201);
});

// POST /api/settings/domain/verify
// Poll Resend for the domain's verification status. When Resend reports
// `verified`, switch the custom email to <username>@<domain>.
settingsRoutes.post('/domain/verify', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  if (!user.customDomain || !user.customDomainResendId) {
    throw new HTTPException(404, { message: 'No custom domain to verify' });
  }
  if (!tierAllowsCustomDomain((user.tier ?? 'free') as Tier)) {
    throw new HTTPException(403, {
      message: 'Your current plan does not support custom domains.',
    });
  }

  let remote;
  try {
    remote = await resendDomainsClient.get(user.customDomainResendId);
  } catch (err) {
    if (err instanceof ResendNotConfiguredError) {
      throw new HTTPException(503, { message: err.message });
    }
    throw new HTTPException(502, {
      message: err instanceof Error ? err.message : 'Resend verification check failed',
    });
  }

  if (remote.status === 'verified') {
    const customEmail = `${user.username}@${user.customDomain}`;
    // Guard against a duplicate custom email (unique index).
    const clash = await userRepository.findByCustomEmail(customEmail);
    if (clash && clash.id !== user.id) {
      await userRepository.updateCustomDomainStatus(user.id, 'rejected', remote.records);
      throw new HTTPException(409, {
        message: `The address ${customEmail} is already in use. Choose a different domain or username.`,
      });
    }
    await userRepository.verifyCustomDomain(user.id, customEmail);
    const info: CustomDomainInfo = {
      domain: user.customDomain,
      status: 'verified',
      resendId: user.customDomainResendId,
      records: remote.records,
      verifiedAt: new Date(),
      createdAt: user.updatedAt ?? null,
    };
    const body: ApiResponse<CustomDomainInfo> = { success: true, data: info };
    return c.json(body);
  }

  // Still pending (or failed) — persist the latest records/status for display.
  const mapped = remote.status === 'failed' ? 'rejected' : 'pending';
  await userRepository.updateCustomDomainStatus(user.id, mapped, remote.records);
  const info: CustomDomainInfo = {
    domain: user.customDomain,
    status: mapped,
    resendId: user.customDomainResendId,
    records: remote.records,
    verifiedAt: null,
    createdAt: user.updatedAt ?? null,
  };
  const body: ApiResponse<CustomDomainInfo> = { success: true, data: info };
  return c.json(body);
});

// DELETE /api/settings/domain
settingsRoutes.delete('/domain', async (c) => {
  const auth = c.get('auth');
  const user = await userRepository.findById(auth.user.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  if (!user.customDomain) {
    throw new HTTPException(404, { message: 'No custom domain associated' });
  }

  // Best-effort: remove the domain from Resend.
  if (user.customDomainResendId) {
    await resendDomainsClient.remove(user.customDomainResendId);
  }

  // Revert the custom email to the default <username>@<EMAIL_DOMAIN>.
  const defaultEmail = `${user.username}@${EMAIL_DOMAIN}`;
  await userRepository.clearCustomDomain(user.id, defaultEmail);

  const body: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: 'Custom domain removed. Your address is now ' + defaultEmail },
  };
  return c.json(body);
});