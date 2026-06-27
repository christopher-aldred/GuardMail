import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { MailIcon } from '../components/Icons';
import { PublicNav } from '../components/PublicNav';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />
        <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
        <form onSubmit={submit} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
          <h1 className="text-xl font-bold text-center">Forgot password?</h1>
          {sent ? (
            <div className="text-center space-y-3">
              <MailIcon size={32} className="text-blue-400 mx-auto" />
              <p className="text-sm text-gray-300">If an account exists for <strong>{email}</strong>, a reset link has been sent.</p>
              <Link to="/login" className="text-blue-400 text-sm hover:underline block">Back to login</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 text-center">Enter your email and we'll send you a reset link.</p>
              {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
              <input
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-sm text-center text-gray-400">
                Remembered? <Link to="/login" className="text-blue-400 hover:underline">Log in</Link>
              </p>
            </>
          )}
        </form>
        <p className="text-xs text-gray-600 text-center mt-4">
          Need help? Email <a href="mailto:help@aiguard.email" className="text-blue-400 hover:underline">help@aiguard.email</a>
        </p>
        </div>
        </div>
      </div>
    </div>
  );
}
