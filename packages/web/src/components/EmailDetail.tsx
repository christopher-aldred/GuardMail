import { SecurityBadge } from './SecurityBadge';

interface Props {
  email: {
    id: string;
    fromAddress?: string;
    from?: string;
    toAddresses?: string[];
    to?: string[];
    subject: string;
    body: string;
    bodyHtml?: string;
    createdAt: string;
    scanResults?: { id: string; scanner: string; passed: boolean; riskScore: number; details: string; scannedAt: string }[];
    attachments?: { id: string; filename: string; mimeType: string; size: number }[];
  };
  onDelete?: () => void;
}

/**
 * Choose the best available body to render.
 *
 * Many real-world emails are HTML-only — their plain-text `body` is
 * empty and the actual content lives in `bodyHtml`. Prefer the HTML
 * version when present so the dashboard always shows the message.
 */
function pickBody(email: Props['email']): { html: boolean; content: string } {
  const html = (email.bodyHtml ?? '').trim();
  const text = (email.body ?? '').trim();
  if (html) return { html: true, content: email.bodyHtml! };
  if (text) return { html: false, content: email.body };
  return { html: false, content: '(empty message)' };
}

export function EmailDetail({ email, onDelete }: Props) {
  const from = email.fromAddress ?? email.from ?? 'unknown';
  const to = email.toAddresses ?? email.to ?? [];
  return (
    <article className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
        <header className="mb-4 border-b border-gray-700/50 pb-3">
          <h1 className="text-xl font-bold text-gray-100 mb-2">{email.subject || '(no subject)'}</h1>
          <p className="text-sm text-gray-400">From: {from}</p>
          <p className="text-sm text-gray-400">To: {to.join(', ')}</p>
          <p className="text-xs text-gray-500 mt-1">{new Date(email.createdAt).toLocaleString()}</p>
        </header>

        <section className="mb-4">
          <h2 className="font-semibold mb-2 text-gray-200">Security Scan Results</h2>
          <div className="flex flex-wrap gap-2">
            {(email.scanResults ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-1">
                <SecurityBadge passed={s.passed} riskScore={s.riskScore} scanner={s.scanner} />
                <span className="text-xs text-gray-500">{s.details}</span>
              </div>
            ))}
            {!email.scanResults?.length && <SecurityBadge label="Not scanned" />}
          </div>
        </section>

        {email.attachments && email.attachments.length > 0 && (
          <section className="mb-4">
            <h2 className="font-semibold mb-2 text-gray-200">Attachments</h2>
            <ul className="text-sm text-gray-400">
              {email.attachments.map((a) => (
                <li key={a.id}>{a.filename} — {a.mimeType} ({a.size} bytes)</li>
              ))}
            </ul>
          </section>
        )}

        {(() => {
          const { html, content } = pickBody(email);
          return html ? (
            <iframe
              title="email-body"
              srcDoc={content}
              className="w-full min-h-[300px] bg-white border border-gray-700/50 rounded-lg"
              sandbox=""
            />
          ) : (
            <section className="whitespace-pre-wrap bg-gray-900 border border-gray-700/50 p-4 rounded-lg text-gray-300 text-sm">
              {content}
            </section>
          );
        })()}

        {onDelete && (
          <button
            onClick={onDelete}
            className="mt-4 rounded-lg bg-red-600/80 px-4 py-2 text-sm text-white hover:bg-red-600 transition"
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
