import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EmailList } from '../components/EmailList';
import { InboxIcon } from '../components/Icons';

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const billing = searchParams.get('billing');
  const [emails, setEmails] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(() => {
    api.listInbox()
      .then(setEmails)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 30_000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4 text-gray-100 flex items-center gap-2"><InboxIcon size={20} className="text-blue-400" /> Inbox</h1>
      {billing === 'success' && (
        <div className="flex items-center justify-between gap-3 mb-4 rounded-xl border border-green-700/50 bg-green-900/30 px-4 py-3">
          <p className="text-sm text-green-200">
            Payment successful — your subscription is now active. It may take a moment for your plan to update.
          </p>
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs text-green-300 hover:text-green-100 underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <EmailList emails={emails as any} />}
    </div>
  );
}
