import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { EmailList } from '../components/EmailList';
import { SendIcon } from '../components/Icons';

export function SentPage() {
  const [emails, setEmails] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(() => {
    Promise.all([api.listSent(), api.listPending()])
      .then(([sent, pending]) => {
        const all = [
          ...(pending as any[]).map((e) => ({ ...e, _pending: true })),
          ...(sent as any[]),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEmails(all);
      })
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
      <h1 className="text-xl font-bold mb-4 text-gray-100 flex items-center gap-2"><SendIcon size={20} className="text-blue-400" /> Sent</h1>
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <EmailList emails={emails as any} />}
    </div>
  );
}
