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

export function HermesPage() {
  useSeo({
    title: 'Connect Hermes Agent to AI Guard Mail via MCP',
    description:
      'Step-by-step guide to connect your Hermes autonomous agent to AI Guard Mail for security-scanned email workflows over the Model Context Protocol (MCP).',
    path: '/docs/hermes',
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
                <BotIcon size={28} className="text-purple-400" /> Hermes Agent
              </h1>
              <p className="text-gray-400 text-lg">
                Connect AI Guard Mail to your Hermes agent for autonomous, security-scanned
                email workflows via the Model Context Protocol.
              </p>
            </div>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Prerequisites</h2>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> An AI Guard Mail account and API key (see the <Link to="/docs" className="text-blue-400 hover:underline">Docs overview</Link>).</li>
                <li className="flex items-start gap-2"><CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" /> Hermes agent runtime installed.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 1 — Configure the MCP endpoint</h2>
              <p className="text-sm text-gray-400">Add AI Guard Mail to your Hermes MCP server registry:</p>
              <CodeBlock code={`# hermes.yaml
mcp_servers:
  ai-guard-mail:
    url: ${MCP_URL}
    headers:
      x-api-key: "<your-api-key>"`} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 2 — Register your agent's mailbox</h2>
              <p className="text-sm text-gray-400">Use the <code className="text-green-400">register_user</code> tool (or the web UI) to provision a custom <code className="text-green-400">@aiguard.email</code> address for Hermes:</p>
              <CodeBlock code={`hermes run --tool ai-guard-mail.register_user \\
  --args '{"username":"hermes-bot","email":"ops@yourcompany.com","password":"secure-pass-123"}'`} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 3 — Define an email workflow</h2>
              <p className="text-sm text-gray-400">Hermes can poll the inbox, triage with LLM Guard results, and reply — all through MCP:</p>
              <CodeBlock code={`# Example Hermes workflow
hermes workflow:
  - name: "Triage inbox"
    steps:
      - tool: ai-guard-mail.list_inbox
      - filter: "scanResults[].scanner == 'llm-guard' && !passed"
        action: "Flag for review"
      - tool: ai-guard-mail.get_email
        for_each: "{{ flagged_emails }}"
      - tool: ai-guard-mail.send_email
        with:
          to: ["admin@yourcompany.com"]
          subject: "Quarantined email alert"
          body: "{{ email.subject }} was quarantined."`} />
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-bold">Step 4 — Run</h2>
              <CodeBlock code={`hermes run --workflow triage-inbox --schedule "*/15 * * * *"`} />
            </section>

            <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-4 text-sm text-purple-200">
              <p className="flex items-center gap-2"><ShieldIcon size={16} /> Hermes emails are scanned by LLM Guard on both inbound and outbound. Any detected prompt injection or jailbreak attempt is quarantined and never delivered to the agent.</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-4">
              <Link to="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center gap-2">
                Get started <ArrowRightIcon size={16} />
              </Link>
              <Link to="/docs/openclaw" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <TerminalIcon size={16} /> OpenClaw guide
              </Link>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
