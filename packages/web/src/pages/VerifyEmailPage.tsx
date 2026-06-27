import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ShieldIcon, CheckIcon } from '../components/Icons';
import { PublicNav } from '../components/PublicNav';

type State = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token was provided in the link.');
      return;
    }
    api
      .verifyEmail(token)
      .then((res) => {
        setState('success');
        setMessage(res.message);
      })
      .catch((e: unknown) => {
        setState('error');
        setMessage(e instanceof Error ? e.message : 'Verification failed.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />
        <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md w-full bg-gray-800/40 border border-gray-700/50 rounded-xl p-8 text-center fade-up">
          <div className="flex justify-center mb-4">
            <ShieldIcon size={36} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-bold mb-3">
            {state === 'verifying' && 'Verifying your email…'}
            {state === 'success' && 'Email verified!'}
            {state === 'error' && 'Verification failed'}
          </h1>
          <p className="text-sm text-gray-400 mb-6">{message}</p>
          {state === 'success' && (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition"
            >
              <CheckIcon size={16} /> Continue to log in
            </Link>
          )}
          {state !== 'success' && (
            <Link
              to="/"
              className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-600 px-5 py-2.5 rounded-lg text-gray-300 text-sm font-medium transition"
            >
              Back to home
            </Link>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
