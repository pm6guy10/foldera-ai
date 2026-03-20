'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Settings } from 'lucide-react';

interface Integration {
  provider: string;
  is_active: boolean;
  sync_email?: string;
  scopes?: string | null;
}

interface SubscriptionInfo {
  status: string;
  plan?: string;
  daysRemaining?: number;
}

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') { setLoading(false); return; }
    Promise.all([
      fetch('/api/integrations/status'),
      fetch('/api/subscription/status'),
    ]).then(async ([intRes, subRes]) => {
      if (intRes.ok) {
        const d = await intRes.json();
        setIntegrations(d.integrations || []);
      }
      if (subRes.ok) {
        setSubscription(await subRes.json());
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [status]);

  // Auto-sync after OAuth connection — makes the product feel alive on day one
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected') === 'true';
    const microsoftConnected = params.get('microsoft_connected') === 'true';
    if (!googleConnected && !microsoftConnected) return;

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    const provider = googleConnected ? 'google' : 'microsoft';
    const syncUrl = googleConnected ? '/api/google/sync-now' : '/api/microsoft/sync-now';

    setSyncStatus(`Syncing your ${provider === 'google' ? 'Google' : 'Microsoft'} data...`);

    fetch(syncUrl, { method: 'POST' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const count = data.total ?? 0;
          setSyncStatus(`Synced ${count} signal${count !== 1 ? 's' : ''} from ${provider === 'google' ? 'Google' : 'Microsoft'}.`);
        } else {
          setSyncStatus('Sync started. Your data will be ready shortly.');
        }
      })
      .catch(() => {
        setSyncStatus('Sync started. Your data will be ready shortly.');
      })
      .finally(() => {
        // Clear status after 6 seconds
        setTimeout(() => setSyncStatus(null), 6000);
      });
  }, [status]);

  const google = integrations.find(i => i.provider === 'google');
  const microsoft = integrations.find(i => i.provider === 'azure_ad');

  // Scope checks removed — no Reconnect button in the UI.

  const handleSignOut = async () => {
    try {
      // Use redirect:false so we control the redirect.
      // If CSRF fetch fails silently, signOut() resolves without
      // clearing the cookie — the hard redirect below still lands
      // the user on / where no session-gated content is shown.
      await signOut({ redirect: false, callbackUrl: '/' });
    } catch {
      // signOut threw (network/CSRF failure) — fall through
    }
    // Always force a hard navigation to clear client-side state
    window.location.href = '/';
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (res.ok) {
        await signOut({ callbackUrl: '/' });
      } else {
        const d = await res.json().catch(() => ({}));
        setDeleteError(typeof d.error === 'string' ? d.error : 'Could not delete account right now.');
      }
    } catch {
      setDeleteError('Could not delete account right now.');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
          <div className="animate-pulse space-y-3 mt-4">
            <div className="h-4 w-40 bg-zinc-800 rounded" />
            <div className="h-16 bg-zinc-900 rounded-xl" />
            <div className="h-16 bg-zinc-900 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
          <p className="text-zinc-400 text-sm mt-8">Please sign in to view settings.</p>
        </main>
      </div>
    );
  }

  const planLabel = subscription?.plan === 'pro' ? 'Pro' : 'Free trial';
  const planDetail =
    subscription?.status === 'active' ? 'Active' :
    subscription?.status === 'active_trial' && subscription.daysRemaining != null
      ? `${subscription.daysRemaining} day${subscription.daysRemaining !== 1 ? 's' : ''} left`
      : subscription?.status === 'past_due' ? 'Payment past due'
      : subscription?.status === 'expired' ? 'Expired'
      : '';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">

        {/* Sync status banner */}
        {syncStatus && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <p className="text-sm text-cyan-300">{syncStatus}</p>
          </div>
        )}

        {/* Connected accounts */}
        <h2 className="text-lg font-semibold text-white">Connected accounts</h2>

        <div className="mt-3 bg-zinc-900 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GoogleIcon />
            <div>
              <p className="text-sm font-medium text-white">Google</p>
              <p className={`text-sm ${google?.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {google?.is_active ? (google.sync_email || 'Connected') : 'Not connected'}
              </p>
            </div>
          </div>
          {google?.is_active ? (
            <button
              onClick={() => fetch('/api/google/disconnect', { method: 'POST' }).then(() => window.location.reload())}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => { window.location.href = '/api/google/connect'; }}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg px-3 py-1 text-white transition-colors"
            >
              Connect
            </button>
          )}
        </div>


        <div className="mt-3 bg-zinc-900 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MicrosoftIcon />
            <div>
              <p className="text-sm font-medium text-white">Microsoft</p>
              <p className={`text-sm ${microsoft?.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {microsoft?.is_active ? (microsoft.sync_email || 'Connected') : 'Not connected'}
              </p>
            </div>
          </div>
          {microsoft?.is_active ? (
            <button
              onClick={() => fetch('/api/microsoft/disconnect', { method: 'POST' }).then(() => window.location.reload())}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => { window.location.href = '/api/microsoft/connect'; }}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg px-3 py-1 text-white transition-colors"
            >
              Connect
            </button>
          )}
        </div>


        {/* Subscription */}
        <h2 className="text-lg font-semibold text-white mt-8">Subscription</h2>
        <div className="mt-3 bg-zinc-900 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{planLabel}</p>
            {planDetail && <p className="text-sm text-zinc-500">{planDetail}</p>}
          </div>
          {subscription?.status !== 'active' && (
            <button
              onClick={async () => {
                const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                const d = await res.json().catch(() => ({}));
                if (d.url) window.location.href = d.url;
              }}
              className="text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 text-white font-medium transition-colors"
            >
              Upgrade
            </button>
          )}
        </div>

        {/* Manual trigger */}
        <h2 className="text-lg font-semibold text-white mt-8">Daily brief</h2>
        <div className="mt-3 bg-zinc-900 rounded-xl p-4">
          <p className="text-sm text-zinc-400 mb-3">
            Sync your email and calendar, then generate and send today&apos;s brief.
          </p>
          <button
            disabled={generateState === 'loading'}
            onClick={async () => {
              setGenerateState('loading');
              setGenerateMessage(null);
              try {
                const res = await fetch('/api/settings/run-brief', { method: 'POST' });
                const data = await res.json().catch(() => null);
                if (res.ok && data?.ok) {
                  setGenerateState('success');
                  setGenerateMessage('Brief generated and sent. Redirecting to dashboard…');
                  setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
                } else if (res.ok && data?.stages) {
                  // Partial success — show what happened
                  const parts: string[] = [];
                  const stages = data.stages as Record<string, any>;
                  if (stages.sync_microsoft?.ok === false) parts.push('Microsoft sync failed');
                  if (stages.sync_google?.ok === false) parts.push('Google sync failed');
                  if (stages.daily_brief?.ok === false) parts.push('Brief generation failed');
                  setGenerateState(parts.length > 0 ? 'error' : 'success');
                  setGenerateMessage(parts.length > 0 ? parts.join('. ') + '.' : 'Done.');
                } else {
                  setGenerateState('error');
                  setGenerateMessage(data?.error || 'Something went wrong.');
                }
              } catch {
                setGenerateState('error');
                setGenerateMessage('Network error — could not reach the server.');
              }
            }}
            className={`w-full rounded-xl py-3 text-sm font-medium transition-colors ${
              generateState === 'loading'
                ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {generateState === 'loading' ? 'Running sync + generate…' : 'Generate now'}
          </button>
          {generateMessage && (
            <p className={`mt-2 text-xs ${generateState === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {generateMessage}
            </p>
          )}
        </div>

        {/* Account */}
        <h2 className="text-lg font-semibold text-white mt-8">Account</h2>
        {session?.user?.email && (
          <p className="text-sm text-zinc-500 mt-1">{session.user.email}</p>
        )}

        <button
          onClick={handleSignOut}
          className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-3 text-sm font-medium transition-colors"
        >
          Sign out
        </button>

        <button
          onClick={handleDeleteAccount}
          className="mt-3 w-full border border-red-900 hover:border-red-700 text-red-400 hover:text-red-300 rounded-xl py-3 text-sm font-medium transition-colors"
        >
          {deleteConfirm ? 'Tap again to confirm deletion' : 'Delete account'}
        </button>

        {deleteError && (
          <p className="mt-2 text-xs text-red-400">{deleteError}</p>
        )}

      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-10 bg-zinc-950 border-b border-zinc-800 h-14">
      <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-4">
        <Link href="/dashboard" className="text-lg font-bold text-white">Foldera</Link>
        <Settings className="w-5 h-5 text-white" />
      </div>
    </header>
  );
}

function GoogleIcon() {
  return (
    <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
      <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}
