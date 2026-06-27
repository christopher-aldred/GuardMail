import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { BanIcon } from '../components/Icons';

interface Config {
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high' | 'custom';
  allowlist: string[];
  blocklist: string[];
  keywordRules: { keyword: string; action: 'flag' | 'block'; score: number }[];
  blockContentTypes: string[];
}

export function SpamSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [allowlist, setAllowlist] = useState('');
  const [blocklist, setBlocklist] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const c = (await api.getSpamSettings()) as Config;
    setConfig(c);
    setAllowlist(c.allowlist.join(', '));
    setBlocklist(c.blocklist.join(', '));
  };
  if (!config) {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    return <p className="text-gray-500">Loading settings…</p>;
  }

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await api.updateSpamSettings({
        enabled: config.enabled,
        sensitivity: config.sensitivity,
        allowlist: allowlist.split(',').map((s) => s.trim()).filter(Boolean),
        blocklist: blocklist.split(',').map((s) => s.trim()).filter(Boolean),
        keywordRules: config.keywordRules,
        blockContentTypes: config.blockContentTypes,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <form onSubmit={save} className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-lg font-bold text-gray-100 flex items-center gap-2"><BanIcon size={20} className="text-blue-400" /> Spam Filter Settings</h1>
      {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
      {saved && <p className="text-green-400 text-sm">Saved.</p>}

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-gray-200">Enable spam filtering</span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-300 mb-1">Sensitivity</span>
          <select
            className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
            value={config.sensitivity}
            onChange={(e) => setConfig({ ...config, sensitivity: e.target.value as Config['sensitivity'] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-300 mb-1">Allowlist (comma-separated emails)</span>
          <input
            className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-300 mb-1">Blocklist (comma-separated emails)</span>
          <input
            className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            value={blocklist}
            onChange={(e) => setBlocklist(e.target.value)}
          />
        </label>

        <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 font-medium transition">
          Save
        </button>
      </div>
    </form>
  );
}
