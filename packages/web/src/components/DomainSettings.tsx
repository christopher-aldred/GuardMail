import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { GlobeIcon, CheckIcon, RefreshIcon, TrashIcon } from './Icons';

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
  ttl?: number;
}

interface DomainInfo {
  domain: string;
  status: 'pending' | 'verified' | 'rejected';
  resendId?: string | null;
  records?: DnsRecord[] | null;
  verifiedAt?: string | null;
  createdAt?: string | null;
}

export function DomainSettings({ tier, allowsDomain }: { tier: string; allowsDomain: boolean }) {
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCustomDomain();
      setInfo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load custom domain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const associate = async () => {
    setError(null);
    setNotice(null);
    const domain = domainInput.trim().toLowerCase();
    if (!domain) {
      setError('Enter a domain (e.g. example.com)');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.setCustomDomain(domain);
      setInfo(res);
      setDomainInput('');
      setNotice('Domain registered. Publish the DNS records below, then click “Verify now”.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to associate domain');
    } finally {
      setVerifying(false);
    }
  };

  const verify = async () => {
    setError(null);
    setNotice(null);
    setVerifying(true);
    try {
      const res = await api.verifyCustomDomain();
      setInfo(res);
      if (res.status === 'verified') {
        setNotice('Domain verified! Your email address is now ' + `${res.domain}.`);
      } else if (res.status === 'rejected') {
        setError('Verification failed. Double-check the DNS records and try again.');
      } else {
        setNotice('Still pending. Make sure the DNS records are published, then try again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification check failed');
    } finally {
      setVerifying(false);
    }
  };

  const remove = async () => {
    setError(null);
    setNotice(null);
    if (!confirm('Remove your custom domain? Your address will revert to the default domain.')) return;
    setRemoving(true);
    try {
      const res = await api.removeCustomDomain();
      setInfo(null);
      setNotice(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove domain');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <GlobeIcon size={18} className="text-blue-400" />
        <h3 className="font-semibold text-gray-100">Custom Domain</h3>
        {info && (
          <span
            className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${
              info.status === 'verified'
                ? 'bg-green-950/50 border-green-800/50 text-green-300'
                : info.status === 'rejected'
                  ? 'bg-red-950/50 border-red-800/50 text-red-300'
                  : 'bg-amber-950/40 border-amber-800/40 text-amber-300'
            }`}
          >
            {info.status}
          </span>
        )}
      </div>

      {!allowsDomain ? (
        <div className="text-sm text-gray-400 space-y-2">
          <p>
            Custom domains are available on the <span className="text-gray-200 font-medium">Hobby</span>,{' '}
            <span className="text-gray-200 font-medium">Pro</span>, and{' '}
            <span className="text-gray-200 font-medium">Custom</span> plans. Your current plan is{' '}
            <span className="text-gray-200 font-medium capitalize">{tier}</span>.
          </p>
          <p className="text-gray-500">
            Upgrade to send and receive mail from your own domain (e.g.{' '}
            <code className="text-green-400 px-1">you@yourdomain.com</code>).
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400">
            Send and receive mail from{' '}
            <code className="text-green-400 px-1">yourname@yourdomain.com</code> instead of the default
            domain. We verify ownership through DNS records.
          </p>

          {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
          {notice && <p className="text-green-400 text-sm bg-green-950/40 rounded-lg px-3 py-2">{notice}</p>}

          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : info ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-blue-300 font-mono">
                  {info.domain}
                </code>
                <button
                  onClick={verify}
                  disabled={verifying || info.status === 'verified'}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-2.5 rounded-lg text-sm text-white transition flex items-center gap-1 disabled:opacity-50"
                  title="Verify now"
                >
                  <RefreshIcon size={16} className={verifying ? 'animate-spin' : ''} />
                  Verify now
                </button>
                <button
                  onClick={remove}
                  disabled={removing}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-2.5 rounded-lg text-sm text-gray-300 transition disabled:opacity-50"
                  title="Remove domain"
                >
                  {removing ? <RefreshIcon size={16} className="animate-spin" /> : <TrashIcon size={16} />}
                </button>
              </div>

              {info.status === 'verified' && (
                <p className="text-sm text-green-300 flex items-center gap-1.5">
                  <CheckIcon size={16} /> Verified — your email address is now{' '}
                  <code className="text-green-400 px-1">{info.domain}</code>.
                </p>
              )}

              {info.records && info.records.length > 0 && info.status !== 'verified' && (
                <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700/50">
                    Publish these DNS records at your domain registrar:
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-700/40">
                          <th className="text-left font-medium px-3 py-2">Type</th>
                          <th className="text-left font-medium px-3 py-2">Name</th>
                          <th className="text-left font-medium px-3 py-2">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.records.map((r, i) => (
                          <tr key={i} className="border-b border-gray-800/60 last:border-0">
                            <td className="px-3 py-2 text-gray-300 font-mono">{r.type}</td>
                            <td className="px-3 py-2 text-gray-300 font-mono max-w-[160px] truncate" title={r.name}>
                              {r.name}
                            </td>
                            <td className="px-3 py-2 text-gray-300 font-mono max-w-[260px] truncate" title={r.value}>
                              {r.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="flex-1 bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-600"
              />
              <button
                onClick={associate}
                disabled={verifying}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
              >
                <GlobeIcon size={16} /> {verifying ? 'Adding…' : 'Add domain'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}