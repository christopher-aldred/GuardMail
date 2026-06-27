import { Link } from 'react-router-dom';
import {
  ShieldIcon, BotIcon, CodeIcon, TerminalIcon, CheckIcon, ArrowRightIcon,
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

export function OpenClawPage() {
  useSeo({
    title: 'Connect OpenClaw Agent to AI Guard Mail via MCP',
    description:
      'Step-by-step guide to connect your OpenClaw AI agent to AI Guard Mail for secure, LLM-Guard-scanned email access over the Model Context Protocol (MCP).',
    path: '/docs/openclaw',
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />

        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="space-y-8 fade-up">
            <div>
              <h1 className="text-3xl font-bold mb-3 flex items-center gap-3">
                <BotIcon size={28} className="text-blue-400" /> OpenClaw Agent
              </h1>
              <p className="text-gray-400 text-lg">
                Connect AI Guard Mail to your OpenClaw agent so it can read, send, and manage
                scanned email through the Model Context Protocol.
              </p>
            </div>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Prerequisites</h2>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> An AI Guard Mail account and API key (see the <Link to="/docs" className="text-blue-400 hover:underline">Docs overview</Link>).</li>
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> OpenClaw installed and configured.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 1 — Add the MCP server</h2>
              <p className="text-sm text-gray-400">Add the <code className="text-green-400">ai-guard-mail</code> server to your OpenClaw MCP configuration:</p>
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
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 2 — Start your agent</h2>
              <p className="text-sm text-gray-400">Launch OpenClaw with the config — the tools will be auto-discovered:</p>
              <CodeBlock code={`openclaw --config openclaw.config.json`} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 3 — Example prompts</h2>
              <div className="space-y-2">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Check inbox</p>
                  <code className="text-sm text-gray-300">"List my latest inbox emails and flag any that were quarantined."</code>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Send scanned email</p>
                  <code className="text-sm text-gray-300">"Send an email to alice@example.com with subject 'Hello' and body 'Test from my AI assistant.'"</code>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Get scan report</p>
                  <code className="text-sm text-gray-300">"Get the full security scan report for email ID 27dd96e8-..."</code>
                </div>
              </div>
            </section>

            <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 text-sm text-blue-200">
              <p className="flex items-center gap-2"><ShieldIcon size={16} /> All emails sent through OpenClaw are scanned by LLM Guard before delivery. Prompt injection attempts are quarantined automatically and never exposed to the agent.</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-4">
              <Link to="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center gap-2">
                Get started <ArrowRightIcon size={16} />
              </Link>
              <Link to="/docs/hermes" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <CodeIcon size={16} /> Hermes guide
              </Link>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
