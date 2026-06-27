import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

interface PendingAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: string; // Base64
}

const MAX_ATTACHMENT_MB = Number(import.meta.env.VITE_MAX_ATTACHMENT_SIZE_MB ?? 25);
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/** Read a File as a Base64 string (without the data: prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      // Strip the `data:<mime>;base64,` prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export function ComposeForm() {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const added: PendingAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" exceeds the ${MAX_ATTACHMENT_MB} MB attachment limit`);
        continue;
      }
      try {
        const content = await readFileAsBase64(file);
        added.push({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          content,
        });
      } catch (err) {
        setError(`Could not read "${file.name}": ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }
    setAttachments((prev) => [...prev, ...added]);
    // Reset the input so the same file can be re-selected.
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const recipients = to.split(',').map((s) => s.trim()).filter(Boolean);
      await api.sendEmail({
        to: recipients,
        subject,
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
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
      <div className="space-y-2">
        <label className="block text-sm text-gray-400">
          Attachments
          <input
            type="file"
            multiple
            onChange={onFiles}
            className="block w-full mt-1 text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white file:font-medium file:hover:bg-blue-700"
          />
        </label>
        {attachments.length > 0 && (
          <ul className="space-y-1">
            {attachments.map((a, i) => (
              <li
                key={`${a.filename}-${i}`}
                className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 text-sm text-gray-200"
              >
                <span className="truncate">
                  {a.filename}{' '}
                  <span className="text-gray-500">({(a.size / 1024).toFixed(1)} KB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-red-400 hover:text-red-300 ml-2"
                  aria-label={`Remove ${a.filename}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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