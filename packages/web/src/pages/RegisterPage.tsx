import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PublicNav } from '../components/PublicNav';
import { api } from '../api';
import { TIER_CARDS } from '../components/SubscriptionSettings';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tier = searchParams.get('tier');
  const tierCard = TIER_CARDS.find((t) => t.id === tier && t.available) ?? null;
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
      await register(username, email, password);
      // If the user came from a Subscribe button, carry the intent
      // forward and jump straight to Stripe Checkout for that tier.
      if (tierCard) {
        const { url } = await api.startCheckout(tier!);
        window.location.href = url;
        return; // keep loading state while we redirect
      }
      setTimeout(() => navigate('/app/inbox'), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          <h1 className="text-xl font-bold text-center">Create your account</h1>
          {error && <p className="text-red-400 text-sm bg-red-950/50 rounded-lg px-3 py-2">{error}</p>}
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="Username (min 3 chars)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            type="email"
            placeholder="Your existing email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            type="password"
            placeholder="Password (min 8 chars)"
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
            {loading ? 'Creating account…' : 'Register'}
          </button>
          <p className="text-sm text-center text-gray-400">
            Already have an account?{' '}
            <Link to={tierCard ? `/login?tier=${tier}` : '/login'} className="text-blue-400 hover:underline">Log in</Link>
          </p>
          {tierCard ? (
            <p className="text-xs text-center text-gray-500">
              You’re signing up for <span className="text-gray-300">Free</span>, then
              upgrading to <span className="text-gray-300">{tierCard.name}</span>{' '}
              ({tierCard.priceLabel}) after checkout.
            </p>
          ) : (
            <p className="text-xs text-center text-gray-500">
              You’re signing up for the <span className="text-gray-300">Free</span> plan —
              3,000 emails/mo, 100/day. Upgrade to Hobby or Pro anytime.
            </p>
          )}
        </form>
        </div>
        </div>
      </div>
    </div>
  );
}
