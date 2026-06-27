import { Link } from 'react-router-dom';
import {
  DocIcon, BotIcon, CodeIcon, TerminalIcon, CheckIcon,
  KeyIcon, ArrowRightIcon, MailIcon, AlertIcon,
} from '../components/Icons';
import { PublicNav } from '../components/PublicNav';
import { Footer } from '../components/Footer';

const MCP_URL = 'https://mcp.aiguard.email/mcp';

const mcpTools = [
  { name: 'register_user', desc: 'Register a new Guardmail user and provision a custom email address.', args: '{ username, email, password }' },
  { name: 'send_email', desc: 'Send an email with automatic LLM Guard scanning.', args: '{ to[], subject, body, bodyHtml? }' },
  { name: 'list_inbox', desc: 'List inbox emails with security scan results.', args: '{ limit?, offset? }' },
  { name: 'list_spam', desc: 'List emails flagged as spam by the spam filter.', args: '{ limit?, offset? }' },
  { name: 'list_quarantine', desc: 'List emails quarantined by LLM Guard or ClamAV.', args: '{ limit?, offset? }' },
  { name: 'get_email', desc: 'Get full email details including the complete security scan report.', args: '{ emailId }' },
  { name: 'update_spam_settings', desc: 'Update the user\u2019s spam filter configuration.', args: '{ enabled, sensitivity, ... }' },
];

const mcpResources = [
  { uri: 'guardmail://inbox', desc: 'Inbox with security scan status.' },
  { uri: 'guardmail://spam', desc: 'Emails flagged as spam.' },
  { uri: 'guardmail://quarantine', desc: 'Emails quarantined by LLM Guard or ClamAV.' },
  { uri: 'guardmail://settings/spam', desc: 'Spam filter configuration.' },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-700/50 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">
      {code}
    </pre>
  );
}

export function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        {/* Nav */}
        <PublicNav />

        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="space-y-8 fade-up">
            <div>
              <h1 className="text-3xl font-bold mb-3 flex items-center gap-2">
                <DocIcon size={24} className="text-blue-400" /> AI Guard Mail Documentation
              </h1>
              <p className="text-gray-400 text-lg">
                AI Guard Mail is a secure email service built for the AI era. It protects your inbox with
                LLM Guard (prompt injection detection), spam filtering, and ClamAV attachment scanning (coming soon).
                Connect your AI agents via the Model Context Protocol (MCP) for programmatic, scanned email access.
              </p>
            </div>

            {/* Help articles — separate pages for SEO indexing */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <DocIcon size={20} className="text-blue-400" /> Help Articles
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link to="/docs/send-receive-ai-agent" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-blue-700/50 transition group">
                  <BotIcon size={24} className="text-blue-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition">Send &amp; Receive Email with an AI Agent</h3>
                  <p className="text-sm text-gray-400 mt-1">How to give an AI agent like OpenClaw a secure mailbox it can read from and write to over MCP.</p>
                  <span className="text-xs text-blue-400 mt-3 inline-flex items-center gap-1">Read guide <ArrowRightIcon size={12} /></span>
                </Link>
                <Link to="/docs/ai-email-use-cases" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-blue-700/50 transition group">
                  <MailIcon size={24} className="text-blue-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition">Top 10 AI Email Use Cases</h3>
                  <p className="text-sm text-gray-400 mt-1">Practical personal and business workflows for giving an AI agent email access.</p>
                  <span className="text-xs text-blue-400 mt-3 inline-flex items-center gap-1">Read guide <ArrowRightIcon size={12} /></span>
                </Link>
                <Link to="/docs/prompt-injection-dangers" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-red-700/50 transition group">
                  <AlertIcon size={24} className="text-red-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-red-400 transition">The Dangers of Prompt Injection</h3>
                  <p className="text-sm text-gray-400 mt-1">Why most AI agents are vulnerable to prompt injection — and how LLM Guard defends you.</p>
                  <span className="text-xs text-red-400 mt-3 inline-flex items-center gap-1">Read guide <ArrowRightIcon size={12} /></span>
                </Link>
                <Link to="/docs/ai-business-support" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-blue-700/50 transition group">
                  <BotIcon size={24} className="text-purple-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-purple-400 transition">AI for Business Support</h3>
                  <p className="text-sm text-gray-400 mt-1">How AI agents automate business support — from Octopus Energy to email-based support at scale.</p>
                  <span className="text-xs text-purple-400 mt-3 inline-flex items-center gap-1">Read guide <ArrowRightIcon size={12} /></span>
                </Link>
                <Link to="/docs/api" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-blue-700/50 transition group">
                  <CodeIcon size={24} className="text-blue-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition">REST API Reference</h3>
                  <p className="text-sm text-gray-400 mt-1">Full HTTP API reference — authenticate with a JWT or API key and build custom integrations on top of scanned email.</p>
                  <span className="text-xs text-blue-400 mt-3 inline-flex items-center gap-1">View reference <ArrowRightIcon size={12} /></span>
                </Link>
              </div>
            </section>

            {/* Agent integration guides — separate pages for SEO indexing */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <BotIcon size={20} className="text-blue-400" /> Agent Integration Guides
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link to="/docs/openclaw" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-blue-700/50 transition group">
                  <BotIcon size={24} className="text-blue-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-blue-400 transition">OpenClaw Agent</h3>
                  <p className="text-sm text-gray-400 mt-1">Connect OpenClaw to read, send, and manage scanned email over MCP.</p>
                  <span className="text-xs text-blue-400 mt-3 inline-flex items-center gap-1">Guide <ArrowRightIcon size={12} /></span>
                </Link>
                <Link to="/docs/hermes" className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 hover:border-purple-700/50 transition group">
                  <BotIcon size={24} className="text-purple-400 mb-2" />
                  <h3 className="font-semibold text-gray-100 group-hover:text-purple-400 transition">Hermes Agent</h3>
                  <p className="text-sm text-gray-400 mt-1">Build autonomous, security-scanned email workflows with Hermes.</p>
                  <span className="text-xs text-purple-400 mt-3 inline-flex items-center gap-1">Guide <ArrowRightIcon size={12} /></span>
                </Link>
              </div>
            </section>

            {/* Architecture */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <CodeIcon size={20} className="text-blue-400" /> Architecture
              </h2>
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-3"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> <span><strong className="text-gray-100">API Server</strong> — Hono + TypeScript, JWT auth, Resend webhook for inbound, PostgreSQL + Redis.</span></div>
                <div className="flex items-start gap-3"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> <span><strong className="text-gray-100">LLM Guard</strong> — Python FastAPI service wrapping llm-guard (PromptInjection, JailbreakDetection, Toxicity scanners).</span></div>
                <div className="flex items-start gap-3"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> <span><strong className="text-gray-100">ClamAV</strong> — Virus scanning for attachments (coming soon).</span></div>
                <div className="flex items-start gap-3"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> <span><strong className="text-gray-100">MCP Server</strong> — Model Context Protocol server exposing tools + resources for AI agents.</span></div>
                <div className="flex items-start gap-3"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> <span><strong className="text-gray-100">Web UI</strong> — React + Vite + Tailwind dashboard for inbox, quarantine, and settings.</span></div>
              </div>
            </section>

            {/* API Key */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <KeyIcon size={20} className="text-blue-400" /> Getting an API Key
              </h2>
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6 space-y-3 text-sm text-gray-300">
                <p>An API key is required to connect AI agents via the MCP server. To get one:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Register an account at <Link to="/register" className="text-blue-400 hover:underline">/register</Link>.</li>
                  <li>An API key is generated automatically on registration.</li>
                  <li>View or regenerate it in the <strong className="text-gray-100">API</strong> section of the dashboard.</li>
                  <li>Pass it as the <code className="text-green-400">x-api-key</code> header in all MCP requests.</li>
                </ol>
              </div>
            </section>

            {/* MCP Tools */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <TerminalIcon size={20} className="text-blue-400" /> MCP Tools
              </h2>
              <div className="space-y-2">
                {mcpTools.map((t) => (
                  <div key={t.name} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                    <code className="text-sm text-blue-400 font-mono">{t.name}</code>
                    <span className="text-xs text-gray-500 ml-3">{t.args}</span>
                    <p className="text-sm text-gray-400 mt-1">{t.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* MCP Resources */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <DocIcon size={20} className="text-blue-400" /> MCP Resources
              </h2>
              <div className="space-y-2">
                {mcpResources.map((r) => (
                  <div key={r.uri} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                    <code className="text-sm text-purple-400 font-mono">{r.uri}</code>
                    <p className="text-sm text-gray-400 mt-1">{r.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Config */}
            <section>
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <CodeIcon size={20} className="text-blue-400" /> MCP Client Config
              </h2>
              <CodeBlock code={`{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "${MCP_URL}",
      "headers": {
        "x-api-key": "<your-api-key>"
      }
    }
  }
}`} />
            </section>

            <div className="flex flex-wrap gap-3 pt-4">
              <Link to="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center gap-2">
                Get started <ArrowRightIcon size={16} />
              </Link>
              <a href="mailto:help@aiguard.email" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <MailIcon size={16} /> Contact support
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
