'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { SkeletonSettingsPage } from '@/components/ui/skeleton';

interface SubscriptionInfo {
  status: string;
  plan?: string;
  daysRemaining?: number;
}

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- FETCH DATA ---
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [intRes, subRes] = await Promise.all([
          fetch('/api/integrations/status'),
          fetch('/api/subscription/status'),
        ]);

        if (!intRes.ok) {
          const errorData = await intRes.json();
          throw new Error(errorData.error || 'Failed to fetch integrations');
        }

        const { integrations: fetchedIntegrations } = await intRes.json();
        setIntegrations(fetchedIntegrations || []);

        if (subRes.ok) {
          const subData = await subRes.json();
          setSubscription(subData);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [session, status]);

  if (status === 'loading' || loading) {
    return <SkeletonSettingsPage />;
  }

  if (status !== 'authenticated') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">Please sign in to view settings</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
              className="px-4 py-2 bg-white text-black hover:bg-zinc-100 rounded-lg font-medium transition-colors text-sm"
            >
              Sign in with Google
            </button>
            <button
              onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard/settings' })}
              className="px-4 py-2 bg-[#00a4ef] text-white hover:bg-[#0078d4] rounded-lg font-medium transition-colors text-sm"
            >
              Sign in with Microsoft
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your connected accounts</p>
      </div>

      {/* DATA SOURCES */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300">Data Sources</h2>
        <GoogleSourceCard
          integration={integrations.find(i => i.provider === 'google')}
          onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
        />
        <MicrosoftSourceCard
          integration={integrations.find(i => i.provider === 'azure_ad')}
          onConnect={() => signIn('azure-ad', { callbackUrl: '/dashboard/settings' })}
        />
      </div>

      {/* SUBSCRIPTION */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Subscription</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-200 text-sm font-medium">
              {subscription?.plan === 'pro' ? 'Pro' : 'Free'}
              {subscription?.status === 'active_trial' && subscription.daysRemaining != null
                ? ` — ${subscription.daysRemaining} day${subscription.daysRemaining !== 1 ? 's' : ''} left in trial`
                : subscription?.status === 'active' ? ' — Active'
                : subscription?.status === 'past_due' ? ' — Payment past due'
                : subscription?.status === 'expired' ? ' — Expired'
                : ''}
            </p>
          </div>
          {subscription?.status !== 'active' && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/stripe/checkout', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan: 'pro' }),
                  });
                  const { url } = await res.json();
                  if (url) window.location.href = url;
                } catch { /* silent */ }
              }}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium transition-colors"
            >
              Upgrade
            </button>
          )}
        </div>
      </div>

      {/* SIGN OUT */}
      <div className="pt-2">
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Sign out
        </button>
      </div>

      <p className="text-zinc-600 text-xs">All integrations secured with OAuth 2.0.</p>
    </div>
  );
}

function GoogleSourceCard({ integration, onConnect }: { integration: any; onConnect: () => void }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = integration?.is_active;
  const email = integration?.sync_email;
  const lastSynced = integration?.last_synced_at;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/google/disconnect', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  const formatSyncTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-50">Google</h3>
            <p className="text-zinc-500 text-sm">Gmail & Calendar</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/20">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-700">
            <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
            Not connected
          </div>
        )}
      </div>

      {isConnected && (
        <div className="mb-4 space-y-1">
          {email && (
            <p className="text-zinc-400 text-xs">
              {email}
            </p>
          )}
          <p className="text-zinc-500 text-xs">
            {lastSynced
              ? `Last synced ${formatSyncTime(lastSynced)}`
              : 'Sync pending'}
          </p>
        </div>
      )}

      {isConnected ? (
        <div className="flex gap-2">
          <button
            onClick={onConnect}
            className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
        >
          Connect Google
        </button>
      )}
    </div>
  );
}

function MicrosoftSourceCard({ integration, onConnect }: { integration: any; onConnect: () => void }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = integration?.is_active;
  const email = integration?.sync_email;
  const lastSynced = integration?.last_synced_at;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/microsoft/disconnect', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      // silent
    } finally {
      setDisconnecting(false);
    }
  };

  const formatSyncTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
              <path d="M1 1h10v10H1z" fill="#F25022"/>
              <path d="M12 1h10v10H12z" fill="#7FBA00"/>
              <path d="M1 12h10v10H1z" fill="#00A4EF"/>
              <path d="M12 12h10v10H12z" fill="#FFB900"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-50">Microsoft</h3>
            <p className="text-zinc-500 text-sm">Mail, Calendar, Files & Tasks</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/20">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-700">
            <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
            Not connected
          </div>
        )}
      </div>

      {isConnected && (
        <div className="mb-4 space-y-1">
          {email && (
            <p className="text-zinc-400 text-xs">
              {email}
            </p>
          )}
          <p className="text-zinc-500 text-xs">
            {lastSynced
              ? `Last synced ${formatSyncTime(lastSynced)}`
              : 'Sync pending'}
          </p>
        </div>
      )}

      {isConnected ? (
        <div className="flex gap-2">
          <button
            onClick={onConnect}
            className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-red-900/30 text-zinc-400 hover:text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
        >
          Connect Microsoft
        </button>
      )}
    </div>
  );
}

function ConnectorCard({ name, description, icon, isConnected, onConnect }: any) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-xl">{icon}</div>
          <div>
            <h3 className="font-semibold text-zinc-50">{name}</h3>
            <p className="text-zinc-500 text-sm">{description}</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/20">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-700">
            <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
            Not connected
          </div>
        )}
      </div>

      {isConnected ? (
        <button onClick={onConnect} className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors">
          Reconnect
        </button>
      ) : (
        <button onClick={onConnect} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
          Connect
        </button>
      )}
    </div>
  );
}
