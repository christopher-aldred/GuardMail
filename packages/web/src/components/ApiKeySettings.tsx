import { useState, useCallback } from 'react';
import { api } from '../api';
import { KeyIcon, CopyIcon, RefreshIcon, CheckIcon } from './Icons';

export function ApiKeySettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getApiKey();
      setApiKey(res.apiKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API key');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!apiKey && !error && !loading) {
    load();
  }

  const copy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    setRegen(true);
    setError(null);
    try {
      const res = await api.regenerateApiKey();
      setApiKey(res.apiKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate');
    } finally {
      setRegen(false);
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyIcon size={18} className="text-blue-400" />
        <h3 className="font-semibold text-gray-100">MCP API Key</h3>
      </div>
      <p className="text-sm text-gray-400">
        Use this key in the <code className="text-green-400 px-1">x-api-key</code> header when connecting AI agents via the MCP server.
      </p>

      {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : apiKey ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-green-400 overflow-x-auto font-mono">
              {apiKey}
            </code>
            <button
              onClick={copy}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2.5 rounded-lg text-sm text-gray-300 transition flex items-center gap-1"
              title="Copy"
            >
              {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            </button>
            <button
              onClick={regenerate}
              disabled={regen}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2.5 rounded-lg text-sm text-gray-300 transition flex items-center gap-1 disabled:opacity-50"
              title="Regenerate"
            >
              <RefreshIcon size={16} className={regen ? 'animate-spin' : ''} />
            </button>
          </div>
          {copied && <p className="text-green-400 text-xs">Copied to clipboard</p>}
        </>
      ) : (
        <button
          onClick={regenerate}
          disabled={regen}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
        >
          <KeyIcon size={16} /> Generate API key
        </button>
      )}

      <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 mt-3">
        <p className="text-xs text-gray-500 mb-2">Example — MCP client config:</p>
        <pre className="text-xs text-gray-300 overflow-x-auto">{`{
  "mcpServers": {
    "ai-guard-mail": {
      "url": "https://mcp.aiguard.email/mcp",
      "headers": { "x-api-key": "${apiKey ?? '<your-api-key>'}" }
    }
  }
}`}</pre>
      </div>
    </div>
  );
}
