import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { EmailList } from '../components/EmailList';
import { ScanIcon } from '../components/Icons';

export function ScanningPage() {
  const [emails, setEmails] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(() => {
    api.listScanning()
      .then(setEmails)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEmails();
    // Poll more frequently since scanning is a transient state
    const interval = setInterval(fetchEmails, 5_000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4 text-gray-100 flex items-center gap-2">
        <ScanIcon size={20} className="text-yellow-400" />
        Scanning
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Emails awaiting security scans. Once cleared, they move to your inbox. Emails here are not accessible to AI agents.
      </p>
      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <EmailList emails={emails as any} />}
    </div>
  );
}
