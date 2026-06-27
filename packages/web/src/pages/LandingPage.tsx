import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ScanIcon,
  BanIcon,
  BotIcon,
  MailIcon,
  LockIcon,
  BugIcon,
  ArrowRightIcon,
  DocIcon,
  TerminalIcon,
  CodeIcon,
  CheckIcon,
} from "../components/Icons";
import { PublicNav } from "../components/PublicNav";
import { Footer } from "../components/Footer";
import { TIER_CARDS } from "../components/SubscriptionSettings";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

const MCP_URL = "https://mcp.aiguard.email/mcp";

const features = [
  {
    Icon: ScanIcon,
    title: "LLM Guard Protection",
    desc: "Every email field — from, to, subject, body, attachments — scanned for prompt injection, jailbreak attempts, and toxicity.",
  },
  {
    Icon: BugIcon,
    title: "ClamAV Scanning",
    comingSoon: true,
    desc: "All inbound attachments scanned for viruses and malware before reaching your inbox.",
  },
  {
    Icon: BanIcon,
    title: "Spam Filtering",
    desc: "Configurable keyword rules, allow/block lists, and sensitivity levels per user.",
  },
  {
    Icon: BotIcon,
    title: "MCP Server",
    desc: "Connect AI agents directly to your mailbox via the Model Context Protocol.",
  },
  {
    Icon: MailIcon,
    title: "Custom Email Address",
    desc: "Get your own @aiguard.email address with full send and receive support.",
  },
  {
    Icon: LockIcon,
    title: "Quarantine System",
    desc: "Suspicious emails are quarantined, not delivered — you decide what to release.",
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busyTier, setBusyTier] = useState<string | null>(null);

  async function subscribe(tier: string) {
    if (!user) {
      navigate(`/register?tier=${tier}`);
      return;
    }
    setBusyTier(tier);
    try {
      const { url } = await api.startCheckout(tier);
      window.location.href = url;
    } catch {
      setBusyTier(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      {/* Animated background */}
      <div className="hero-bg" />
      <div className="hero-grid" />

      <div className="relative z-10">
        {/* Nav */}
        <PublicNav />

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center">
          <div className="fade-up" style={{ animationDelay: "0.1s" }}>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-300 bg-blue-950/40 border border-blue-800/50 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-ring" />
              LLM Guard + Spam Filter + MCP Integration
            </span>
          </div>
          <h1
            className="text-4xl md:text-6xl z-50 font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 text-shimmer fade-up"
            style={{ animationDelay: "0.15s" }}
          >
            Secure AI Agent Email
          </h1>
          <p
            className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto fade-up"
            style={{ animationDelay: "0.25s" }}
          >
            Empower your AI agent without exposing it to attackers. Protection
            against prompt-injection, viruses and spam. Connect your AI agents
            via MCP for secure, scanned email access.
          </p>
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center fade-up"
            style={{ animationDelay: "0.35s" }}
          >
            <Link
              to="/register"
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium transition flex items-center justify-center gap-2"
            >
              Create your mailbox <ArrowRightIcon size={18} />
            </Link>
            <a
              href="#mcp"
              className="border border-gray-700 hover:border-gray-600 px-6 py-3 rounded-lg text-gray-300 font-medium transition flex items-center justify-center gap-2"
            >
              <BotIcon size={18} /> Add to your AI agent
            </a>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="glow-card bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 fade-up relative"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                {f.comingSoon && (
                  <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider text-yellow-400 bg-yellow-950/40 border border-yellow-800/50 rounded-full px-2 py-0.5">
                    Coming soon
                  </span>
                )}
                <div className="text-blue-400 mb-3">
                  <f.Icon size={28} />
                </div>
                <h3 className="font-semibold mb-2 text-gray-100">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-center text-gray-100">
            Simple pricing
          </h2>
          <p className="text-gray-400 text-center mb-10 max-w-xl mx-auto">
            Start free. Upgrade when your AI agents need more volume. Pricing is
            a simple per-1,000-email rate, capped at each tier’s monthly
            allowance.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIER_CARDS.filter((t) => !t.hidden).map((t) => {
              const isFree = t.id === "free";
              return (
                <div
                  key={t.id}
                  className={`relative flex flex-col rounded-xl border p-5 ${
                    isFree
                      ? "border-blue-600/60 bg-blue-950/20"
                      : "border-gray-700/50 bg-gray-800/40"
                  }`}
                >
                  {isFree && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-semibold uppercase tracking-wide bg-blue-600 text-white rounded px-2 py-0.5">
                      Available
                    </span>
                  )}
                  {!t.available && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-semibold uppercase tracking-wide bg-amber-600/80 text-white rounded px-2 py-0.5">
                      Coming soon
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-gray-100">{t.name}</h3>
                  <p className="text-2xl font-bold text-gray-100 mt-1">
                    {t.priceLabel}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 mb-4">{t.blurb}</p>
                  <ul className="space-y-1.5 flex-1">
                    {t.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-1.5 text-sm text-gray-300"
                      >
                        <CheckIcon
                          size={15}
                          className="text-blue-400 mt-0.5 shrink-0"
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isFree ? (
                    <Link
                      to="/register"
                      className="mt-5 block text-center bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-lg text-white font-medium transition"
                    >
                      Get started
                    </Link>
                  ) : t.available && t.id !== "custom" ? (
                    <button
                      onClick={() => subscribe(t.id)}
                      disabled={busyTier !== null}
                      className="mt-5 block text-center bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2.5 rounded-lg text-white font-medium transition w-full"
                    >
                      {busyTier === t.id ? "Redirecting…" : "Subscribe"}
                    </button>
                  ) : (
                    <a
                      href="mailto:help@aiguard.email"
                      className="mt-5 block text-center border border-gray-700 hover:border-gray-600 px-4 py-2.5 rounded-lg text-gray-300 font-medium transition"
                    >
                      Contact support
                    </a>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-gray-500 mt-6">
            Start free, upgrade when you need more. For the Custom plan, email{" "}
            <a
              href="mailto:help@aiguard.email"
              className="text-blue-400 hover:underline"
            >
              help@aiguard.email
            </a>
            .
          </p>
        </section>

        {/* MCP Setup */}
        <section id="mcp" className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold mb-2 text-center text-gray-100 flex items-center justify-center gap-2">
            <BotIcon size={24} className="text-blue-400" /> Connect your AI
            Agent
          </h2>
          <p className="text-gray-400 text-center mb-8">
            Add AI Guard Mail to Open Claw, Hermes, Claude, or any
            MCP-compatible agent.
          </p>

          <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                MCP Server URL
              </h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-green-400 overflow-x-auto">
                  {MCP_URL}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(MCP_URL)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm text-gray-300 transition"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                API Key (required for authentication)
              </h3>
              <p className="text-sm text-gray-500">
                Generate an API key from{" "}
                <Link to="/register" className="text-blue-400 hover:underline">
                  the API section
                </Link>{" "}
                after registering, then pass it as the{" "}
                <code className="text-green-400">x-api-key</code> header.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">
                MCP client config (JSON)
              </h3>
              <pre className="bg-gray-900 border border-gray-700/50 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">
                {`{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "${MCP_URL}",
      "headers": {
        "x-api-key": "<your-api-key>"
      }
    }
  }
}`}
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <TerminalIcon size={16} /> Available MCP Tools
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { name: "register_user", desc: "Create a new mailbox" },
                  { name: "send_email", desc: "Send scanned email" },
                  { name: "list_inbox", desc: "View inbox emails" },
                  { name: "list_spam", desc: "View spam emails" },
                  { name: "list_quarantine", desc: "View quarantined emails" },
                  {
                    name: "get_email",
                    desc: "Get email details + scan report",
                  },
                  {
                    name: "update_spam_settings",
                    desc: "Configure spam filter",
                  },
                ].map((t) => (
                  <div
                    key={t.name}
                    className="bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2"
                  >
                    <code className="text-xs text-blue-400">{t.name}</code>
                    <p className="text-xs text-gray-500">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-700/50">
              <Link
                to="/register"
                className="block text-center bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium transition"
              >
                Get your API key →
              </Link>
              <p className="text-center text-sm text-gray-500 mt-3">
                Need help? Email{" "}
                <a
                  href="mailto:help@aiguard.email"
                  className="text-blue-400 hover:underline"
                >
                  help@aiguard.email
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
