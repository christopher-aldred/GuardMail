import { useEffect, useState } from 'react';
import { api } from '../api';
import { ShieldIcon } from './Icons';

/**
 * Security settings — per-user outbound LLM Guard toggle.
 *
 * When disabled, outbound (sent) emails skip the LLM Guard prompt-injection
 * / toxicity scan. Inbound scanning is always on regardless of this setting,
 * so incoming mail is still checked before it reaches the inbox.
 */
export function SecuritySettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSecuritySettings()
      .then((s) => setEnabled(s.llmGuardOutboundEnabled))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (enabled === null) {
    return <p className="text-gray-500">Loading settings…</p>;
  }

  const save = async () => {
    setError(null);
    setSaved(false);
    try {
      const res = await api.updateSecuritySettings({ llmGuardOutboundEnabled: enabled });
      setEnabled(res.llmGuardOutboundEnabled);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="max-w-2xl mx-auto p-4 md:p-6 space-y-4"
    >
      <h1 className="text-lg font-bold text-gray-100 flex items-center gap-2">
        <ShieldIcon size={20} className="text-blue-400" /> Security Settings
      </h1>
      {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
      {saved && <p className="text-green-400 text-sm">Saved.</p>}

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 mt-1 accent-blue-600"
          />
          <span className="text-gray-200">
            <span className="block font-medium">Scan outbound email with LLM Guard</span>
            <span className="block text-sm text-gray-400">
              When enabled, every email you send is scanned for prompt injection,
              jailbreak attempts, and toxicity before delivery. Disabling this
              only affects <strong>outbound</strong> mail — incoming mail is always
              scanned before it reaches your inbox.
            </span>
          </span>
        </label>

        {!enabled && (
          <p className="text-amber-300 text-sm bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2">
            ⚠️ Outbound emails will no longer be checked for prompt-injection
            payloads before being sent. An agent could relay an injection to a
            third party. Re-enable this for maximum safety.
          </p>
        )}

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 font-medium transition"
        >
          Save
        </button>
      </div>
    </form>
  );
}
