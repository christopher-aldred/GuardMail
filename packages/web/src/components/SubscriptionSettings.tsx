import { useEffect, useState } from "react";
import { api } from "../api";
import { CheckIcon } from "./Icons";

interface SubscriptionInfo {
  tier: string;
  name: string;
  monthlyLimit: number | null;
  dailyLimit: number;
  priceCents: number | null;
  available: boolean;
  sentThisMonth: number;
  sentToday: number;
  emailVerified: boolean;
  email: string;
  unverifiedSendLimit: number | null;
  sentLifetimeOutbound: number;
}

// Mirrors shared TIERS — kept here so the public pricing copy lives in one
// place the landing page also imports.
export const TIER_CARDS: {
  id: string;
  name: string;
  monthlyLimit: number | null;
  dailyLimit: number;
  priceLabel: string;
  available: boolean;
  hidden?: boolean;
  blurb: string;
  features: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    monthlyLimit: 3000,
    dailyLimit: 100,
    priceLabel: "£0",
    available: true,
    blurb: "Perfect for trying out secure AI-agent email.",
    features: [
      "3,000 emails / month",
      "100 emails / day",
      "LLM Guard prompt-injection scanning",
      "ClamAV virus scanning",
      "Spam filter + quarantine",
      "MCP server access",
    ],
  },
  {
    id: "hobby",
    name: "Hobby",
    monthlyLimit: 18_000,
    dailyLimit: 600,
    priceLabel: "£25/mo",
    available: true,
    blurb: "For makers sending and receiving more than the free allowance.",
    features: [
      "18,000 emails / month",
      "600 emails / day",
      "Everything in Free",
      "Custom domain",
      "No branding footer",
      "Priority scan queue",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyLimit: 42_000,
    dailyLimit: 2000,
    priceLabel: "£50/mo",
    available: true,
    blurb: "For side-projects and personal automation that sends more.",
    features: [
      "42,000 emails / month",
      "2,000 emails / day",
      "Everything in Hobby",
      "Custom domain",
      "No branding footer",
      "Priority scan queue",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    monthlyLimit: null,
    dailyLimit: Infinity,
    priceLabel: "Contact us",
    available: false,
    blurb: "Volume, SLAs, and custom security policies.",
    features: [
      "Custom monthly volume",
      "Custom daily cap",
      "Everything in Pro",
      "Custom domain",
      "No branding footer",
      "Dedicated support",
      "Custom scan policies",
    ],
  },
];

function pct(used: number, limit: number | null): number {
  if (limit === null || limit === Infinity) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function SubscriptionSettings() {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const load = () => {
    api
      .getSubscription()
      .then(setSub)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Failed to load subscription",
        ),
      );
  };
  useEffect(load, []);

  async function startCheckout(tier: string) {
    setError(null);
    setBusyTier(tier);
    try {
      const { url } = await api.startCheckout(tier);
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to start checkout",
      );
      setBusyTier(null);
    }
  }

  async function openBillingPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const { url } = await api.openBillingPortal();
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to open billing portal",
      );
      setPortalLoading(false);
    }
  }

  async function resendVerification() {
    if (!sub) return;
    setResendError(null);
    setResendSent(false);
    try {
      await api.resendVerification(sub.email);
      setResendSent(true);
    } catch (e) {
      setResendError(
        e instanceof Error ? e.message : "Failed to resend verification email",
      );
    }
  }

  const monthlyPct = sub ? pct(sub.sentThisMonth, sub.monthlyLimit) : 0;
  const dailyPct = sub ? pct(sub.sentToday, sub.dailyLimit) : 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-100">Subscription</h2>
        {sub && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-950/60 border border-blue-800/50 text-blue-300 capitalize">
            {sub.tier} plan
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sub && !sub.emailVerified && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 space-y-2">
          <p className="text-sm text-amber-200">
            <span className="font-semibold">Verify your email address.</span>{" "}
            Your account isn’t verified yet, so sending is capped at{" "}
            {sub.unverifiedSendLimit != null
              ? `${sub.unverifiedSendLimit} sent emails in total`
              : "a reduced limit"}
            . Verify to unlock your plan’s full limits.
          </p>
          {resendSent ? (
            <p className="text-xs text-amber-300">Verification email sent — check your inbox (and spam folder).</p>
          ) : (
            <button
              onClick={resendVerification}
              className="text-xs text-amber-300 hover:text-amber-100 underline"
            >
              Resend verification email
            </button>
          )}
          {resendError && <p className="text-xs text-red-400">{resendError}</p>}
        </div>
      )}

      {sub && (
        <>
          <p className="text-sm text-gray-400">
            You are on the{" "}
            <span className="text-gray-200 font-medium">{sub.name}</span> plan.{" "}
            {sub.unverifiedSendLimit != null
              ? `Unverified — capped at ${sub.unverifiedSendLimit} sent emails in total.`
              : sub.monthlyLimit === null
                ? "Unlimited monthly volume."
                : `${sub.monthlyLimit.toLocaleString()} outbound emails / month.`}{" "}
            {sub.dailyLimit === Infinity
              ? "No daily cap."
              : `${sub.dailyLimit.toLocaleString()} emails / day.`}
          </p>

          {/* Usage bars */}
          <div className="space-y-3">
            {sub.unverifiedSendLimit != null ? (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Unverified sending limit (lifetime)</span>
                  <span>
                    {sub.sentLifetimeOutbound.toLocaleString()} / {sub.unverifiedSendLimit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-900 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${pct(sub.sentLifetimeOutbound, sub.unverifiedSendLimit)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>This month</span>
                  <span>
                    {sub.sentThisMonth.toLocaleString()}
                    {sub.monthlyLimit !== null &&
                      ` / ${sub.monthlyLimit.toLocaleString()}`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-900 overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${monthlyPct}%` }}
                  />
                </div>
              </div>
            )}
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Today</span>
                <span>
                  {sub.sentToday.toLocaleString()}
                  {sub.dailyLimit !== Infinity &&
                    ` / ${sub.dailyLimit.toLocaleString()}`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-900 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Plan grid */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            {TIER_CARDS.filter((t) => !t.hidden).map((t) => {
              const isCurrent = t.id === sub.tier;
              return (
                <div
                  key={t.id}
                  className={`rounded-lg border p-4 ${
                    isCurrent
                      ? "border-blue-600/60 bg-blue-950/20"
                      : "border-gray-700/50 bg-gray-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-100">
                      {t.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {t.priceLabel}
                    </span>
                  </div>
                  {!t.available && !isCurrent && (
                    <span className="inline-block text-[10px] uppercase tracking-wide text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded px-1.5 py-0.5 mb-2">
                      Coming soon
                    </span>
                  )}
                  {t.available && !isCurrent && t.priceLabel !== "£0" && t.priceLabel !== "Contact us" && (
                    <button
                      onClick={() => startCheckout(t.id)}
                      disabled={busyTier !== null}
                      className="w-full mt-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium py-2 px-3 transition"
                    >
                      {busyTier === t.id ? "Redirecting…" : `Subscribe to ${t.name}`}
                    </button>
                  )}
                  <ul className="space-y-1 mt-2">
                    {t.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-1.5 text-xs text-gray-400"
                      >
                        <CheckIcon
                          size={14}
                          className="text-blue-400 mt-0.5 shrink-0"
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {sub.tier !== "free" && sub.tier !== "custom" && (
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="w-full rounded-lg border border-gray-700/60 bg-gray-900/40 hover:bg-gray-800/60 disabled:opacity-60 text-gray-200 text-sm font-medium py-2 px-3 transition"
            >
              {portalLoading ? "Loading…" : "Manage billing"}
            </button>
          )}

          <p className="text-xs text-gray-500 pt-1">
            To discuss the Custom plan, email{" "}
            <a
              href="mailto:help@aiguard.email"
              className="text-blue-400 hover:underline"
            >
              help@aiguard.email
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}
