import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function ComposeForm() {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const recipients = to.split(',').map((s) => s.trim()).filter(Boolean);
      await api.sendEmail({ to: recipients, subject, body });
      navigate('/app/sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-100">✏️ Compose</h1>
      {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
      <input
        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        placeholder="To (comma-separated emails)"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        required
      />
      <input
        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        required
      />
      <textarea
        className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5 h-48 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
        placeholder="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700 font-medium disabled:opacity-50 transition"
      >
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
