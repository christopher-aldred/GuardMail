import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { TrashIcon } from './Icons';

export function DeleteAccount() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.deleteAccount(password);
      logout();
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message ?? 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800/40 border border-red-800/40 rounded-xl p-5 space-y-3">
      <h2 className="text-sm font-semibold text-red-300 flex items-center gap-2">
        <TrashIcon size={18} className="text-red-400" />
        Delete account
      </h2>
      <p className="text-xs text-gray-400">
        Permanently delete your account and all associated emails, settings, and
        data. This action cannot be undone.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-red-900/60 text-red-200 border border-red-800/60 hover:bg-red-900 transition"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Enter your password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-red-500"
            disabled={loading}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition disabled:opacity-50"
            >
              {loading ? 'Deleting…' : 'Confirm deletion'}
            </button>
            <button
              onClick={() => { setConfirming(false); setPassword(''); setError(''); }}
              disabled={loading}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}