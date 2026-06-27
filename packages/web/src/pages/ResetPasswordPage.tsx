import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { CheckIcon } from '../components/Icons';
import { PublicNav } from '../components/PublicNav';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
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
          <h1 className="text-xl font-bold text-center">Reset password</h1>
          {done ? (
            <div className="text-center space-y-3">
              <CheckIcon size={32} className="text-green-400 mx-auto" />
              <p className="text-sm text-gray-300">Password reset successfully. Redirecting to login…</p>
            </div>
          ) : (
            <>
              {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
              {!params.get('token') && (
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  placeholder="Reset token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
              )}
              <input
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                type="password"
                placeholder="New password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
            </>
          )}
        </form>
        </div>
        </div>
      </div>
    </div>
  );
}
