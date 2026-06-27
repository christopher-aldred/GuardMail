import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SpamSettings } from '../components/SpamSettings';
import { SecuritySettings } from '../components/SecuritySettings';
import { SubscriptionSettings } from '../components/SubscriptionSettings';
import { DeleteAccount } from '../components/DeleteAccount';
import { DomainSettings } from '../components/DomainSettings';
import { SettingsIcon } from '../components/Icons';
import { api } from '../api';

// Tiers that can associate a custom domain (mirrors shared TIERS).
const DOMAIN_TIERS = new Set(['hobby', 'pro', 'custom']);

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const billing = searchParams.get('billing');
  const [tier, setTier] = useState<string>('free');

  useEffect(() => {
    api
      .getSubscription()
      .then((s) => setTier(s.tier))
      .catch(() => setTier('free'));
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
        <SettingsIcon size={22} className="text-blue-400" />
        Settings
      </h1>
      {billing === 'cancelled' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-600/50 bg-gray-800/50 px-4 py-3">
          <p className="text-sm text-gray-300">
            Checkout was cancelled — you’re still on your current plan. You can subscribe any time from the options below.
          </p>
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs text-gray-400 hover:text-gray-200 underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}
      <SubscriptionSettings />
      <DomainSettings tier={tier} allowsDomain={DOMAIN_TIERS.has(tier)} />
      <SecuritySettings />
      <SpamSettings />
      <DeleteAccount />
    </div>
  );
}