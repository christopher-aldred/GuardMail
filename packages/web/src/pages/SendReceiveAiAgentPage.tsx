import { Link } from 'react-router-dom';
import {
  ShieldIcon, BotIcon, CodeIcon, TerminalIcon, CheckIcon, ArrowRightIcon,
  MailIcon, SendIcon, InboxIcon,
} from '../components/Icons';
import { PublicNav } from '../components/PublicNav';
import { Footer } from '../components/Footer';
import { useSeo } from '../hooks/useSeo';

const MCP_URL = 'https://mcp.aiguard.email/mcp';

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-700/50 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">
      {code}
    </pre>
  );
}

export function SendReceiveAiAgentPage() {
  useSeo({
    title: 'Send and Receive Email with AI Agents like OpenClaw | AI Guard Mail',
    description:
      'Step-by-step guide to sending and receiving email from AI agents like OpenClaw using AI Guard Mail\'s secure MCP server — with LLM Guard scanning on every inbound and outbound message.',
    path: '/docs/send-receive-ai-agent',
    publishedTime: '2026-06-25',
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />

        <article className="max-w-3xl mx-auto px-6 py-10">
          <div className="space-y-8 fade-up">
            <div>
              <p className="text-sm text-blue-400 font-medium mb-2">Guide</p>
              <h1 className="text-3xl font-bold mb-3 flex items-center gap-3">
                <BotIcon size={28} className="text-blue-400" /> How to Send and Receive Email with an AI Agent
              </h1>
              <p className="text-gray-400 text-lg">
                Give an AI agent like <strong className="text-gray-200">OpenClaw</strong> a secure mailbox it can
                read from and write to — over the Model Context Protocol (MCP), with every message scanned by
                LLM Guard for prompt-injection and malware before it reaches the agent.
              </p>
            </div>

            <nav className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5 text-sm">
              <p className="text-gray-500 font-medium mb-2">In this guide</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-300">
                <li><a href="#why" className="text-blue-400 hover:underline">Why give an AI agent email access?</a></li>
                <li><a href="#prereqs" className="text-blue-400 hover:underline">Prerequisites</a></li>
                <li><a href="#connect" className="text-blue-400 hover:underline">Connect the agent over MCP</a></li>
                <li><a href="#receive" className="text-blue-400 hover:underline">Receiving (reading) email</a></li>
                <li><a href="#send" className="text-blue-400 hover:underline">Sending email</a></li>
                <li><a href="#security" className="text-blue-400 hover:underline">How the scanning keeps you safe</a></li>
              </ol>
            </nav>

            <section id="why" className="space-y-4">
              <h2 className="text-xl font-bold">Why give an AI agent email access?</h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                Email is where work actually happens — invoices, support tickets, scheduling, approvals.
                Connecting an AI agent to a mailbox lets it triage your inbox, draft replies, summarise
                threads, and take action on structured messages without you copy-pasting into a chat window.
                The risk: every email becomes <em>untrusted input</em> that the agent reads. A malicious
                email can contain a <Link to="/docs/prompt-injection-dangers" className="text-blue-400 hover:underline">prompt-injection</Link> payload
                that hijacks the agent. AI Guard Mail solves this by scanning every message with LLM Guard
                <em> before</em> the agent sees it.
              </p>
            </section>

            <section id="prereqs" className="space-y-4">
              <h2 className="text-xl font-bold">Prerequisites</h2>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> An AI Guard Mail account — register at <Link to="/register" className="text-blue-400 hover:underline">/register</Link> to get a custom <code className="text-green-400">@aiguard.email</code> address.</li>
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> Your API key from the <strong className="text-gray-100">API</strong> section of the dashboard.</li>
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> An MCP-capable agent. This guide uses <strong className="text-gray-100">OpenClaw</strong>; the same config works for Hermes, Claude Desktop, and any client that speaks the Model Context Protocol.</li>
              </ul>
            </section>

            <section id="connect" className="space-y-4">
              <h2 className="text-xl font-bold">Step 1 — Connect the agent over MCP</h2>
              <p className="text-sm text-gray-400">Add the <code className="text-green-400">ai-guard-mail</code> server to your agent's MCP configuration, passing your API key as a header:</p>
              <CodeBlock code={`// openclaw.config.json
{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "${MCP_URL}",
      "headers": {
        "x-api-key": "<your-api-key>"
      }
    }
  }
}`} />
              <p className="text-sm text-gray-400">Launch the agent — the email tools are auto-discovered:</p>
              <CodeBlock code={`openclaw --config openclaw.config.json`} />
            </section>

            <section id="receive" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><InboxIcon size={20} className="text-blue-400" /> Step 2 — Receive (read) email</h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                Inbound mail to your <code className="text-green-400">@aiguard.email</code> address is received via the
                SMTP server or the Resend inbound webhook, then queued for scanning. Once LLM Guard and ClamAV finish,
                the email lands in the <strong className="text-gray-100">inbox</strong> and the agent can list and read it:
              </p>
              <div className="space-y-2">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">List inbox</p>
                  <code className="text-sm text-gray-300">"Summarise my latest 10 inbox emails and highlight any that were quarantined."</code>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Read a thread</p>
                  <code className="text-sm text-gray-300">"Get the full email and scan report for message ID 27dd96e8-..."</code>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                The agent calls the <code className="text-green-400">list_inbox</code> and <code className="text-green-400">get_email</code> MCP tools.
                Emails still being scanned are <strong className="text-gray-100">never exposed</strong> to the agent, and
                quarantined prompt-injection payloads are redacted so they can't enter the agent's context window.
              </p>
            </section>

            <section id="send" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><SendIcon size={20} className="text-blue-400" /> Step 3 — Send email</h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                Outbound mail is scanned by LLM Guard <em>before</em> delivery — so a compromised agent can't exfiltrate
                data or send injection-laced messages on your behalf. Ask the agent:
              </p>
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                <code className="text-sm text-gray-300">"Send an email to alice@example.com with subject 'Hello' and body 'Test from my AI assistant.'"</code>
              </div>
              <p className="text-sm text-gray-400">
                The agent calls <code className="text-green-400">send_email</code>, which creates a <code className="text-green-400">pending</code> email,
                enqueues it for scanning, and delivers it only if it passes.
              </p>
            </section>

            <section id="security" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><ShieldIcon size={20} className="text-blue-400" /> How the scanning keeps you safe</h2>
              <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 text-sm text-blue-200 space-y-2">
                <p className="flex items-center gap-2"><ShieldIcon size={16} /> <strong>Inbound:</strong> every received email is scanned before it reaches the agent. Prompt-injection and jailbreak attempts are quarantined; the raw payload is never returned to the agent.</p>
                <p className="flex items-center gap-2"><ShieldIcon size={16} /> <strong>Outbound:</strong> sent emails are scanned before delivery, blocking data exfiltration and injection-laced replies.</p>
                <p className="flex items-center gap-2"><ShieldIcon size={16} /> <strong>Attachments:</strong> ClamAV virus-scans files (coming soon).</p>
              </div>
            </section>

            <div className="flex flex-wrap gap-3 pt-4">
              <Link to="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center gap-2">
                Get started <ArrowRightIcon size={16} />
              </Link>
              <Link to="/docs/openclaw" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <TerminalIcon size={16} /> OpenClaw guide
              </Link>
              <Link to="/docs/ai-email-use-cases" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <MailIcon size={16} /> AI email use cases
              </Link>
            </div>
          </div>
        </article>

        <Footer />
      </div>
    </div>
  );
}