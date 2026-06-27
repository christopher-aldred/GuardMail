import { Link } from 'react-router-dom';
import {
  CodeIcon, TerminalIcon, KeyIcon, ArrowRightIcon, CheckIcon,
  ShieldIcon, MailIcon, AlertIcon, ClockIcon, DocIcon,
} from '../components/Icons';
import { PublicNav } from '../components/PublicNav';
import { Footer } from '../components/Footer';
import { useSeo } from '../hooks/useSeo';

/**
 * REST API reference page.
 *
 * Documents the non-MCP HTTP API exposed by the `packages/api` server.
 * Every endpoint here is mirrored by the MCP tools documented on the
 * main Docs page — this page is for developers who want to call the
 * API directly (e.g. custom integrations, scripts) rather than through
 * an MCP client.
 */

const API_BASE = 'https://api.aiguard.email';

/** Endpoint row used by the reference tables below. */
interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  auth: 'none' | 'jwt' | 'key' | 'jwt-or-key' | 'internal';
  desc: string;
}

const authEndpoints: Endpoint[] = [
  { method: 'POST', path: '/api/auth/register', auth: 'none', desc: 'Register a new account. Provisions a custom @aiguard.email address and an API key, and returns a JWT.' },
  { method: 'POST', path: '/api/auth/login', auth: 'none', desc: 'Log in with a username, custom email, or registration email + password. Returns a JWT.' },
  { method: 'POST', path: '/api/auth/forgot-password', auth: 'none', desc: 'Request a password reset link. Always returns success (no user enumeration).' },
  { method: 'POST', path: '/api/auth/reset-password', auth: 'none', desc: 'Reset a password using a token from the reset email.' },
  { method: 'POST', path: '/api/auth/verify-email', auth: 'none', desc: 'Verify the registration email using a token from the verification email.' },
  { method: 'POST', path: '/api/auth/resend-verification', auth: 'none', desc: 'Resend the email verification link.' },
  { method: 'GET', path: '/api/auth/verify-key', auth: 'key', desc: 'Validate an API key. Used by the MCP server; returns whether the key is valid.' },
];

const emailEndpoints: Endpoint[] = [
  { method: 'GET', path: '/api/emails/inbox', auth: 'jwt-or-key', desc: 'List inbox emails with their security scan results. Supports pagination.' },
  { method: 'GET', path: '/api/emails/sent', auth: 'jwt-or-key', desc: 'List sent emails with scan results. Supports pagination.' },
  { method: 'GET', path: '/api/emails/spam', auth: 'jwt-or-key', desc: 'List emails flagged as spam by the spam filter. Supports pagination.' },
  { method: 'GET', path: '/api/emails/quarantine', auth: 'jwt-or-key', desc: 'List emails quarantined by LLM Guard or ClamAV. Supports pagination.' },
  { method: 'GET', path: '/api/emails/scanning', auth: 'jwt-or-key', desc: 'List emails still being scanned (web UI only; API-key callers receive an empty list).' },
  { method: 'GET', path: '/api/emails/pending', auth: 'jwt-or-key', desc: 'List outbound emails pending scan + delivery (web UI only; API-key callers receive an empty list).' },
  { method: 'GET', path: '/api/emails/:id', auth: 'jwt-or-key', desc: 'Get a single email with its full scan results and attachments. Unscanned emails are never exposed to API-key callers.' },
  { method: 'DELETE', path: '/api/emails/:id', auth: 'jwt-or-key', desc: 'Delete an email owned by the authenticated user.' },
  { method: 'POST', path: '/api/emails/send', auth: 'jwt-or-key', desc: 'Send an email. Enqueues it for LLM Guard scanning before delivery. Subject to sending limits.' },
];

const settingsEndpoints: Endpoint[] = [
  { method: 'GET', path: '/api/settings/spam', auth: 'jwt-or-key', desc: 'Get the spam filter configuration for the authenticated user.' },
  { method: 'PUT', path: '/api/settings/spam', auth: 'jwt-or-key', desc: 'Update the spam filter configuration (enabled, sensitivity, allow/block lists, keyword rules).' },
  { method: 'GET', path: '/api/settings/api-key', auth: 'jwt', desc: 'Get the current API key (web UI only; requires a JWT, not an API key).' },
  { method: 'POST', path: '/api/settings/api-key/regenerate', auth: 'jwt', desc: 'Regenerate the API key. The old key is invalidated immediately.' },
];

const systemEndpoints: Endpoint[] = [
  { method: 'GET', path: '/api/health', auth: 'none', desc: 'Health check. Reports LLM Guard and ClamAV availability.' },
  { method: 'POST', path: '/api/inbound', auth: 'internal', desc: 'Internal endpoint called by the SMTP server to deliver a parsed message. Protected by X-Internal-Key.' },
  { method: 'POST', path: '/api/webhooks/resend', auth: 'none', desc: 'Resend inbound email webhook. Verified via Svix signature (RESEND_WEBHOOK_SECRET).' },
];

/** Method → tailwind color class. */
const methodColor: Record<Endpoint['method'], string> = {
  GET: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  POST: 'bg-green-900/50 text-green-300 border-green-700/50',
  PUT: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
  DELETE: 'bg-red-900/50 text-red-300 border-red-700/50',
};

/** Auth badge label. */
function AuthBadge({ auth }: { auth: Endpoint['auth'] }) {
  const labels: Record<Endpoint['auth'], { text: string; cls: string }> = {
    none: { text: 'public', cls: 'bg-gray-700/40 text-gray-300 border-gray-600/40' },
    jwt: { text: 'JWT', cls: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40' },
    key: { text: 'API key', cls: 'bg-purple-900/40 text-purple-300 border-purple-700/40' },
    'jwt-or-key': { text: 'JWT or API key', cls: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40' },
    internal: { text: 'internal', cls: 'bg-orange-900/40 text-orange-300 border-orange-700/40' },
  };
  const l = labels[auth];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${l.cls}`}>
      {l.text}
    </span>
  );
}

function EndpointTable({ rows }: { rows: Endpoint[] }) {
  return (
    <div className="space-y-2">
      {rows.map((e) => (
        <div
          key={`${e.method} ${e.path}`}
          className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4"
        >
          <div className="flex items-center flex-wrap gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${methodColor[e.method]}`}>
              {e.method}
            </span>
            <code className="text-sm text-gray-100 font-mono break-all">{e.path}</code>
            <AuthBadge auth={e.auth} />
          </div>
          <p className="text-sm text-gray-400 mt-1.5">{e.desc}</p>
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-700/50 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">
      {code}
    </pre>
  );
}

export function RestApiPage() {
  useSeo({
    title: 'REST API Reference | AI Guard Mail',
    description:
      'Full REST API reference for AI Guard Mail — authentication, emails, spam settings, and system endpoints. Authenticate with a JWT or an X-API-Key header and build custom integrations on top of LLM-Guard-scanned email.',
    path: '/docs/api',
    publishedTime: '2026-06-25',
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />

        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="space-y-10 fade-up">
            {/* Header */}
            <div>
              <p className="text-sm text-blue-400 font-medium mb-2">Reference</p>
              <h1 className="text-3xl font-bold mb-3 flex items-center gap-3">
                <CodeIcon size={28} className="text-blue-400" /> REST API Reference
              </h1>
              <p className="text-gray-400 text-lg">
                The AI Guard Mail REST API exposes the same secure email operations the MCP server
                uses, over plain HTTP. Use it to build custom integrations and scripts — every
                message is scanned by LLM Guard on the way in and on the way out.
              </p>
            </div>

            {/* TOC */}
            <nav className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5 text-sm">
              <p className="text-gray-500 font-medium mb-2">On this page</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-300">
                <li><a href="#base-url" className="text-blue-400 hover:underline">Base URL</a></li>
                <li><a href="#auth" className="text-blue-400 hover:underline">Authentication</a></li>
                <li><a href="#envelope" className="text-blue-400 hover:underline">Response envelope</a></li>
                <li><a href="#errors" className="text-blue-400 hover:underline">Errors &amp; rate limits</a></li>
                <li><a href="#auth-endpoints" className="text-blue-400 hover:underline">Auth endpoints</a></li>
                <li><a href="#email-endpoints" className="text-blue-400 hover:underline">Email endpoints</a></li>
                <li><a href="#settings-endpoints" className="text-blue-400 hover:underline">Settings endpoints</a></li>
                <li><a href="#system-endpoints" className="text-blue-400 hover:underline">System endpoints</a></li>
                <li><a href="#objects" className="text-blue-400 hover:underline">Object shapes</a></li>
              </ol>
            </nav>

            {/* Base URL */}
            <section id="base-url" className="space-y-4">
              <h2 className="text-xl font-bold">Base URL</h2>
              <p className="text-sm text-gray-300">
                All endpoints are served under a single origin. In production the API is reachable at:
              </p>
              <CodeBlock code={`${API_BASE}`} />
              <p className="text-sm text-gray-400">
                For local development the API server listens on <code className="text-green-400">http://localhost:3000</code>{' '}
                (override with the <code className="text-green-400">API_PORT</code> env var). All paths below are
                relative to the base URL.
              </p>
            </section>

            {/* Authentication */}
            <section id="auth" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <KeyIcon size={20} className="text-blue-400" /> Authentication
              </h2>
              <p className="text-sm text-gray-300">
                Two authentication mechanisms are supported, both sent as headers:
              </p>
              <div className="space-y-3">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-indigo-900/40 text-indigo-300 border-indigo-700/40">JWT</span>
                    <code className="text-sm text-gray-100 font-mono">Authorization: Bearer &lt;token&gt;</code>
                  </div>
                  <p className="text-sm text-gray-400">
                    Issued by <code className="text-green-400">POST /api/auth/login</code> and{' '}
                    <code className="text-green-400">POST /api/auth/register</code>. Tokens expire after 7 days by default
                    (<code className="text-green-400">JWT_EXPIRES_IN</code>). Used by the web UI.
                  </p>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-purple-900/40 text-purple-300 border-purple-700/40">API key</span>
                    <code className="text-sm text-gray-100 font-mono">X-API-Key: &lt;key&gt;</code>
                  </div>
                  <p className="text-sm text-gray-400">
                    Generated on registration and viewable in the <strong className="text-gray-100">API</strong> section of the dashboard.
                    Used by the MCP server and programmatic integrations. When you authenticate with an API key, the
                    API enforces the same safety invariant as MCP: <strong className="text-gray-100">unscanned email
                    content is never exposed</strong>.
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                Endpoints marked <em>JWT or API key</em> accept either header. When both are present, the API key takes
                precedence and the request is treated as an MCP-style caller (with content redaction rules applied).
              </p>
              <CodeBlock code={`# JWT
curl ${API_BASE}/api/emails/inbox \\
  -H "Authorization: Bearer eyJhbGciOi..."

# API key
curl ${API_BASE}/api/emails/inbox \\
  -H "X-API-Key: 8f3c1b2a-..."`} />
            </section>

            {/* Response envelope */}
            <section id="envelope" className="space-y-4">
              <h2 className="text-xl font-bold">Response envelope</h2>
              <p className="text-sm text-gray-300">
                Every endpoint returns JSON with a consistent envelope. Successful responses set{' '}
                <code className="text-green-400">success: true</code> and put the payload in{' '}
                <code className="text-green-400">data</code>; errors set{' '}
                <code className="text-green-400">success: false</code> and put details in{' '}
                <code className="text-green-400">error</code>.
              </p>
              <CodeBlock code={`// Success
{
  "success": true,
  "data": { /* endpoint-specific payload */ }
}

// Error
{
  "success": false,
  "error": {
    "code": "401",
    "message": "Invalid or expired token"
  }
}`} />
            </section>

            {/* Errors & rate limits */}
            <section id="errors" className="space-y-4">
              <h2 className="text-xl font-bold">Errors &amp; rate limits</h2>
              <div className="space-y-2 text-sm text-gray-300">
                <p>Common status codes:</p>
                <ul className="space-y-1 list-disc list-inside ml-2">
                  <li><code className="text-green-400">200</code> — Success.</li>
                  <li><code className="text-green-400">201</code> — Created (registration, send email).</li>
                  <li><code className="text-green-400">202</code> — Accepted and queued for async processing (inbound).</li>
                  <li><code className="text-green-400">400</code> — Invalid input (Zod validation failure).</li>
                  <li><code className="text-green-400">401</code> — Missing or invalid credentials.</li>
                  <li><code className="text-green-400">403</code> — Authenticated but not allowed (e.g. reading an unscanned email via API key, or accessing another user's email).</li>
                  <li><code className="text-green-400">404</code> — Email not found.</li>
                  <li><code className="text-green-400">409</code> — Conflict (account already exists).</li>
                  <li><code className="text-green-400">429</code> — Rate limited, or sending limit reached.</li>
                  <li><code className="text-green-400">500</code> — Internal server error.</li>
                  <li><code className="text-green-400">503</code> — A required service is not configured (e.g. webhook secret missing).</li>
                </ul>
              </div>
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-300 space-y-2">
                <p className="flex items-center gap-2">
                  <ClockIcon size={16} className="text-blue-400" /> <strong className="text-gray-100">Rate limiting:</strong>{' '}
                  all accounts are limited to 10 requests/second per client IP (token bucket, capacity 10). Response
                  headers <code className="text-green-400">X-RateLimit-Limit</code>,{' '}
                  <code className="text-green-400">X-RateLimit-Remaining</code>, and{' '}
                  <code className="text-green-400">Retry-After</code> are set. Override with the{' '}
                  <code className="text-green-400">RATE_LIMIT_RPS</code> env var.
                </p>
                <p className="flex items-center gap-2">
                  <MailIcon size={16} className="text-blue-400" /> <strong className="text-gray-100">Sending limits:</strong>{' '}
                  unverified accounts can send 100 emails (lifetime); verified accounts can send 100 emails/day
                  (configurable via <code className="text-green-400">UNVERIFIED_SEND_LIMIT</code> and{' '}
                  <code className="text-green-400">VERIFIED_DAILY_SEND_LIMIT</code>).
                </p>
              </div>
            </section>

            {/* Auth endpoints */}
            <section id="auth-endpoints" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <KeyIcon size={20} className="text-blue-400" /> Auth endpoints
              </h2>
              <EndpointTable rows={authEndpoints} />
              <p className="text-sm text-gray-400">Register request body:</p>
              <CodeBlock code={`{
  "username": "ada",            // 3-64 chars, [a-zA-Z0-9._-]
  "email": "ada@example.com",   // registration contact email
  "password": "s3cure-pass"     // min 8 chars
}`} />
              <p className="text-sm text-gray-400 mt-3">Register / login response:</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "user": { "id": "...", "username": "ada", "customEmail": "ada@aiguard.email", "emailVerifiedAt": null, ... },
    "token": "eyJhbGciOi...",
    "customEmail": "ada@aiguard.email"   // present on register only
  }
}`} />
              <p className="text-sm text-gray-400 mt-3">
                The login <code className="text-green-400">username</code> field accepts a username, the custom{' '}
                <code className="text-green-400">@aiguard.email</code> address, or the registration email.
              </p>
            </section>

            {/* Email endpoints */}
            <section id="email-endpoints" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MailIcon size={20} className="text-blue-400" /> Email endpoints
              </h2>
              <EndpointTable rows={emailEndpoints} />
              <p className="text-sm text-gray-400 mt-3">
                List endpoints accept <code className="text-green-400">limit</code> (default 50) and{' '}
                <code className="text-green-400">offset</code> (default 0) query parameters, e.g.{' '}
                <code className="text-green-400">/api/emails/inbox?limit=20&amp;offset=40</code>.
              </p>
              <p className="text-sm text-gray-400 mt-3">Send email request body:</p>
              <CodeBlock code={`{
  "to": ["alice@example.com"],   // 1-50 recipients
  "subject": "Hello",            // 1-500 chars
  "body": "Test from my assistant.",  // 1-100,000 chars
  "bodyHtml": "<p>...</p>",       // optional, max 500,000 chars
  "inReplyTo": "27dd96e8-..."     // optional UUID, for threading
}`} />
              <p className="text-sm text-gray-400 mt-3">Send email response:</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "id": "9b1f...",             // email ID (status is "pending" until scan + delivery)
    "status": "pending",
    "smtpConfigured": true       // false if no outbound SMTP is configured
  }
}`} />
              <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 text-sm text-blue-200 space-y-2">
                <p className="flex items-start gap-2">
                  <ShieldIcon size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>API-key safety invariant.</strong> When you authenticate with{' '}
                    <code className="text-green-400">X-API-Key</code>, the API never returns email content that hasn't
                    finished scanning. Emails in <code className="text-green-400">scanning</code>/{' '}
                    <code className="text-green-400">pending</code> status are dropped from list responses, and
                    requesting one by ID returns <code className="text-green-400">403</code>. Quarantined emails are
                    returned with their subject/body <strong>redacted</strong> so a prompt-injection payload can't
                    reach your agent's context window. Use a JWT (web UI flow) to inspect unredacted content.
                  </span>
                </p>
              </div>
            </section>

            {/* Settings endpoints */}
            <section id="settings-endpoints" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CodeIcon size={20} className="text-blue-400" /> Settings endpoints
              </h2>
              <EndpointTable rows={settingsEndpoints} />
              <p className="text-sm text-gray-400 mt-3">Spam settings (PUT) request body:</p>
              <CodeBlock code={`{
  "enabled": true,
  "sensitivity": "medium",        // low | medium | high | custom
  "allowlist": ["trusted@example.com"],
  "blocklist": ["spam@example.com"],
  "keywordRules": [
    { "keyword": "urgent", "action": "flag", "score": 0.5 }
  ],
  "blockContentTypes": ["text/html"]
}`} />
              <p className="text-sm text-gray-400 mt-3">
                <code className="text-green-400">GET /api/settings/api-key</code> and its regenerate sibling require a
                JWT — they're intended for the dashboard and reject API-key auth so a leaked key can't read or rotate
                itself.
              </p>
            </section>

            {/* System endpoints */}
            <section id="system-endpoints" className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <TerminalIcon size={20} className="text-blue-400" /> System endpoints
              </h2>
              <EndpointTable rows={systemEndpoints} />
              <p className="text-sm text-gray-400 mt-3">Health response:</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "status": "ok",
    "llmGuard": true,
    "clamav": false,
    "time": "2026-06-25T10:30:00.000Z"
  }
}`} />
              <div className="bg-orange-950/20 border border-orange-800/40 rounded-xl p-4 text-sm text-orange-200">
                <p className="flex items-start gap-2">
                  <AlertIcon size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Internal only.</strong> <code className="text-green-400">POST /api/inbound</code> is called
                    by the SMTP server package to deliver parsed messages. It's protected by an{' '}
                    <code className="text-green-400">X-Internal-Key</code> header matched against the{' '}
                    <code className="text-green-400">INTERNAL_API_KEY</code> env var — don't expose it publicly. The
                    Resend webhook verifies Svix signatures using <code className="text-green-400">RESEND_WEBHOOK_SECRET</code>.
                  </span>
                </p>
              </div>
            </section>

            {/* Object shapes */}
            <section id="objects" className="space-y-4">
              <h2 className="text-xl font-bold">Object shapes</h2>
              <p className="text-sm text-gray-300">Key objects returned in <code className="text-green-400">data</code>:</p>

              <p className="text-sm text-gray-400 mt-3 font-mono">Email</p>
              <CodeBlock code={`{
  "id": "9b1f-...",
  "from": "sender@example.com",
  "to": ["ada@aiguard.email"],
  "subject": "Re: invoice",
  "body": "plaintext body",
  "bodyHtml": "<p>...</p>",
  "status": "inbox",            // inbox | spam | quarantine | sent | pending | scanning | draft
  "threadId": "...",
  "inReplyTo": "...",
  "scanResults": [ ScanResult, ... ],
  "attachments": [ Attachment, ... ],
  "createdAt": "2026-06-25T...",
  "readAt": null
}`} />

              <p className="text-sm text-gray-400 mt-3 font-mono">ScanResult</p>
              <CodeBlock code={`{
  "id": "...",
  "emailId": "...",
  "scanner": "llm-guard",       // llm-guard | clamav | spam-filter
  "passed": true,
  "riskScore": 0.0,             // 0.0 - 1.0
  "details": "No prompt injection detected.",
  "scannerVersion": "0.4",
  "scannedAt": "2026-06-25T..."
}`} />

              <p className="text-sm text-gray-400 mt-3 font-mono">Attachment</p>
              <CodeBlock code={`{
  "id": "...",
  "emailId": "...",
  "filename": "invoice.pdf",
  "mimeType": "application/pdf",
  "size": 12345,
  "storagePath": "https://...",
  "scanResult": ScanResult,     // optional
  "createdAt": "2026-06-25T..."
}`} />

              <p className="text-sm text-gray-400 mt-3 font-mono">SpamFilterConfig</p>
              <CodeBlock code={`{
  "userId": "...",
  "enabled": true,
  "sensitivity": "medium",
  "allowlist": ["trusted@example.com"],
  "blocklist": [],
  "keywordRules": [{ "keyword": "urgent", "action": "flag", "score": 0.5 }],
  "blockContentTypes": [],
  "updatedAt": "2026-06-25T..."
}`} />
            </section>

            {/* Quick start */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold">Quick start</h2>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-2">
                  <CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Register at <Link to="/register" className="text-blue-400 hover:underline">/register</Link> to get a JWT and an API key.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                  <span>Send emails with <code className="text-green-400">POST /api/emails/send</code>; list them with the inbox/spam/quarantine endpoints.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckIcon size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                  <span>For AI agents, prefer the <Link to="/docs" className="text-blue-400 hover:underline">MCP server</Link> — it wraps these endpoints and applies the same unscanned-content redaction automatically.</span>
                </div>
              </div>
              <CodeBlock code={`# 1. Register
curl -X POST ${API_BASE}/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"username":"ada","email":"ada@example.com","password":"s3cure-pass"}'

# 2. Send an email (with the JWT from step 1)
curl -X POST ${API_BASE}/api/emails/send \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{"to":["alice@example.com"],"subject":"Hello","body":"Test from my assistant."}'

# 3. List the inbox with an API key instead
curl ${API_BASE}/api/emails/inbox?limit=10 \\
  -H "X-API-Key: 8f3c1b2a-..."`} />
            </section>

            <div className="flex flex-wrap gap-3 pt-4">
              <Link to="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center gap-2">
                Get started <ArrowRightIcon size={16} />
              </Link>
              <Link to="/docs" className="border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition flex items-center gap-2">
                <DocIcon size={16} /> MCP docs
              </Link>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}