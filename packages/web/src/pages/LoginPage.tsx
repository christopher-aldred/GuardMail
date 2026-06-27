import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PublicNav } from '../components/PublicNav';
import { api } from '../api';
import { TIER_CARDS } from '../components/SubscriptionSettings';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tier = searchParams.get('tier');
  const tierCard = TIER_CARDS.find((t) => t.id === tier && t.available) ?? null;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect already-authenticated users. Must run in an effect —
  // calling navigate()/setState during render throws in React Router v6
  // and leaves a blank screen.
  useEffect(() => {
    if (!user) return;
    if (tierCard) {
      setLoading(true);
      api
        .startCheckout(tier!)
        .then(({ url }) => { window.location.href = url; })
        .catch(() => { navigate('/settings'); })
        .finally(() => setLoading(false));
    } else {
      navigate('/app/inbox', { replace: true });
    }
  }, [user, tierCard, tier, navigate]);

  if (user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      // Carry a queued Subscribe intent through to Stripe Checkout.
      if (tierCard) {
        const { url } = await api.startCheckout(tier!);
        window.location.href = url;
        return;
      }
      setTimeout(() => navigate('/app/inbox'), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
          <h1 className="text-xl font-bold text-center">Log in</h1>
          {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="Username or email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-blue-400 hover:underline">Forgot password?</Link>
            <span className="text-gray-400">
              No account?{' '}
              <Link to={tierCard ? `/register?tier=${tier}` : '/register'} className="text-blue-400 hover:underline">Register</Link>
            </span>
          </div>
        </form>
        </div>
        </div>
      </div>
    </div>
  );
}
