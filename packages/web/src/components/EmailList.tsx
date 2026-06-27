import { useNavigate } from 'react-router-dom';
import { SecurityBadge } from './SecurityBadge';

interface EmailRow {
  id: string;
  fromAddress?: string;
  from?: string;
  subject: string;
  body: string;
  createdAt: string;
  status: string;
  scanResults?: { scanner: string; passed: boolean; riskScore: number }[];
}

export function EmailList({ emails }: { emails: EmailRow[] }) {
  const navigate = useNavigate();
  if (emails.length === 0) {
    return <p className="text-gray-500 italic p-4">No emails here.</p>;
  }
  return (
    <ul className="divide-y divide-gray-800">
      {emails.map((e) => {
        const from = e.fromAddress ?? e.from ?? 'unknown';
        return (
          <li
            key={e.id}
            className="cursor-pointer p-3 hover:bg-gray-800/50 rounded-lg transition"
            onClick={() => navigate(`/app/emails/${e.id}`)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate text-gray-100">{e.subject || '(no subject)'}</p>
                <p className="text-sm text-gray-500 truncate">From: {from}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-gray-500">{new Date(e.createdAt).toLocaleString()}</span>
                {e.status === 'pending' && (
                  <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded">Pending scan</span>
                )}
                {e.status === 'scanning' && (
                  <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded animate-pulse">Scanning…</span>
                )}
                <div className="flex gap-1 flex-wrap justify-end">
                  {(e.scanResults ?? []).slice(0, 3).map((s, i) => (
                    <SecurityBadge key={i} passed={s.passed} riskScore={s.riskScore} scanner={s.scanner} />
                  ))}
                  {!e.scanResults?.length && <SecurityBadge label="Not scanned" />}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
