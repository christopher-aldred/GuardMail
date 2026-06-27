import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { EmailList } from '../components/EmailList';
import { BanIcon } from '../components/Icons';

export function SpamPage() {
  const [emails, setEmails] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(() => {
    api.listSpam()
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
      <h1 className="text-xl font-bold mb-4 text-gray-100 flex items-center gap-2"><BanIcon size={20} className="text-blue-400" /> Spam</h1>
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <EmailList emails={emails as any} />}
    </div>
  );
}
