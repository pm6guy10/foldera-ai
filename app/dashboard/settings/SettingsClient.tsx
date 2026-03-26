'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

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

const ALL_BUCKETS = [
  'Job search', 'Career growth', 'Side project', 'Business ops',
  'Health & family', 'Financial', 'Relationships', 'Learning',
];

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [goalBuckets, setGoalBuckets] = useState<string[]>([]);
  const [goalFreeText, setGoalFreeText] = useState<string | null>(null);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [disconnecting, setDisconnecting] = useState<'google' | 'microsoft' | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'microsoft' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const refreshIntegrationsStatus = useCallback(async () => {
    const response = await fetch('/api/integrations/status');
    if (!response.ok) {
      throw new Error('Could not refresh integrations status.');
    }

    const data = await response.json();
    setIntegrations(data.integrations || []);
    setSourceCounts(data.sourceCounts || {});
  }, []);

  // On mount: check for connecting_provider localStorage flag (set before OAuth redirect)
  useEffect(() => {
    const provider = localStorage.getItem('connecting_provider');
    if (provider) {
      localStorage.removeItem('connecting_provider');
      setSyncStatus(`Reconnecting ${provider === 'google' ? 'Google' : 'Microsoft'}…`);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return; // keep loading=true while session resolves
    if (status !== 'authenticated') { setLoading(false); return; }
    Promise.all([
      fetch('/api/integrations/status'),
      fetch('/api/subscription/status'),
      fetch('/api/onboard/set-goals'),
    ]).then(async ([intRes, subRes, goalsRes]) => {
      if (intRes.ok) {
        const d = await intRes.json();
        setIntegrations(d.integrations || []);
        setSourceCounts(d.sourceCounts || {});
      }
      if (subRes.ok) {
        setSubscription(await subRes.json());
      }
      if (goalsRes.ok) {
        const g = await goalsRes.json();
        setGoalBuckets(g.buckets ?? []);
        setGoalFreeText(g.freeText ?? null);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [status]);

  // Auto-sync after OAuth connection — makes the product feel alive on day one
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected') === 'true';
    const microsoftConnected = params.get('microsoft_connected') === 'true';
    const googleError = params.get('google_error');
    const microsoftError = params.get('microsoft_error');

    // Show OAuth error messages
    if (googleError) setActionError('Could not connect Google: ' + googleError.replace(/_/g, ' '));
    if (microsoftError) setActionError('Could not connect Microsoft: ' + microsoftError.replace(/_/g, ' '));

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    if (!googleConnected && !microsoftConnected) return;

    const provider = googleConnected ? 'google' : 'microsoft';
    const syncUrl = googleConnected ? '/api/google/sync-now' : '/api/microsoft/sync-now';

    setSyncStatus(`Syncing your ${provider === 'google' ? 'Google' : 'Microsoft'} data…`);

    fetch(syncUrl, { method: 'POST' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          await refreshIntegrationsStatus().catch(() => {});
          const count = data.total ?? 0;
          setSyncStatus(`Synced ${count} signal${count !== 1 ? 's' : ''} from ${provider === 'google' ? 'Google' : 'Microsoft'}.`);
        } else {
          const payload = await res.json().catch(() => ({}));
          const apiError =
            payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
              ? payload.error
              : null;
          setSyncStatus(apiError ?? `Could not sync ${provider === 'google' ? 'Google' : 'Microsoft'} right now.`);
        }
      })
      .catch(() => {
        setSyncStatus(`Could not sync ${provider === 'google' ? 'Google' : 'Microsoft'} right now.`);
      })
      .finally(() => {
        // Clear status after 6 seconds
        setTimeout(() => setSyncStatus(null), 6000);
      });
  }, [status, refreshIntegrationsStatus]);

  // Auto-clear actionError after 5 seconds
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  // Scroll to error when it appears
  useEffect(() => {
    if (actionError && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [actionError]);

  const google = integrations.find(i => i.provider === 'google');
  const microsoft = integrations.find(i => i.provider === 'azure_ad');

  // Scope checks removed — no Reconnect button in the UI.

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/' });
    } catch {
      // signOut threw (network/CSRF failure) — fall through
    }
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

  const isPro = subscription?.plan === 'pro';
  const planLabel = isPro ? 'Pro' : 'Free';
  const planDetail =
    subscription?.status === 'active' ? 'Active' :
    subscription?.status === 'past_due' ? 'Payment past due'
    : '';

  const activeBuckets = goalBuckets.filter(b => ALL_BUCKETS.includes(b));

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

        {actionError && (
          <p ref={errorRef} className="mb-4 text-sm text-red-400">{actionError}</p>
        )}

        {/* Connected accounts */}
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mb-3">Connected accounts</h2>

        {/* Google */}
        <div className={`bg-zinc-900 rounded-xl p-4 flex items-center justify-between border-l-2 ${google?.is_active ? 'border-emerald-500/50' : 'border-zinc-700'}`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <GoogleIcon />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Google</p>
              <p className={`text-sm ${google?.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {google?.is_active ? (google.sync_email || 'Connected') : 'Not connected'}
              </p>
              {google?.is_active && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {sourceCounts['gmail'] ?? 0} Gmail · {sourceCounts['google_calendar'] ?? 0} Calendar · {sourceCounts['drive'] ?? 0} Drive
                </p>
              )}
            </div>
          </div>
          {google?.is_active ? (
            <button
              onClick={async () => {
                setDisconnecting('google');
                setActionError(null);
                // Optimistic update — swap UI immediately before background refresh
                setIntegrations(prev => prev.filter(i => i.provider !== 'google'));
                try {
                  const response = await fetch('/api/google/disconnect', { method: 'POST' });
                  if (response.ok) {
                    refreshIntegrationsStatus().catch(() => {});
                  } else {
                    setActionError('Could not disconnect Google. Try again.');
                    // Revert optimistic update on failure
                    await refreshIntegrationsStatus().catch(() => {});
                  }
                } catch {
                  setActionError('Network error disconnecting Google.');
                  await refreshIntegrationsStatus().catch(() => {});
                } finally {
                  setDisconnecting(null);
                }
              }}
              disabled={disconnecting === 'google'}
              className="ml-3 shrink-0 text-xs border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {disconnecting === 'google' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={() => {
                setConnectingProvider('google');
                localStorage.setItem('connecting_provider', 'google');
                window.location.href = '/api/google/connect';
              }}
              disabled={connectingProvider === 'google'}
              className="ml-3 shrink-0 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {connectingProvider === 'google' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>

        {/* Microsoft */}
        <div className={`mt-3 bg-zinc-900 rounded-xl p-4 flex items-center justify-between border-l-2 ${microsoft?.is_active ? 'border-emerald-500/50' : 'border-zinc-700'}`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <MicrosoftIcon />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Microsoft</p>
              <p className={`text-sm ${microsoft?.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {microsoft?.is_active ? (microsoft.sync_email || 'Connected') : 'Not connected'}
              </p>
              {microsoft?.is_active && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {sourceCounts['outlook'] ?? 0} Mail · {sourceCounts['outlook_calendar'] ?? 0} Calendar · {sourceCounts['onedrive'] ?? 0} OneDrive
                </p>
              )}
            </div>
          </div>
          {microsoft?.is_active ? (
            <button
              onClick={async () => {
                setDisconnecting('microsoft');
                setActionError(null);
                // Optimistic update — swap UI immediately before background refresh
                setIntegrations(prev => prev.map(i =>
                  i.provider === 'azure_ad' ? { ...i, is_active: false, sync_email: undefined } : i
                ));
                try {
                  const response = await fetch('/api/microsoft/disconnect', { method: 'POST' });
                  if (response.ok) {
                    refreshIntegrationsStatus().catch(() => {});
                  } else {
                    setActionError('Could not disconnect Microsoft. Try again.');
                    await refreshIntegrationsStatus().catch(() => {});
                  }
                } catch {
                  setActionError('Network error disconnecting Microsoft.');
                  await refreshIntegrationsStatus().catch(() => {});
                } finally {
                  setDisconnecting(null);
                }
              }}
              disabled={disconnecting === 'microsoft'}
              className="ml-3 shrink-0 text-xs border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {disconnecting === 'microsoft' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={() => {
                setConnectingProvider('microsoft');
                localStorage.setItem('connecting_provider', 'microsoft');
                window.location.href = '/api/microsoft/connect';
              }}
              disabled={connectingProvider === 'microsoft'}
              className="ml-3 shrink-0 text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {connectingProvider === 'microsoft' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>

        {/* Focus areas */}
        <div className="border-t border-zinc-800 mt-10" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mt-4 mb-3">Your focus areas</h2>
        <div className="bg-zinc-900 rounded-xl p-4">
          {activeBuckets.length === 0 && !goalFreeText ? (
            <p className="text-sm text-zinc-500">No focus areas set.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {activeBuckets.map((label) => (
                  <span
                    key={label}
                    className="rounded-lg py-1.5 px-3 text-xs font-medium bg-cyan-500/15 border border-cyan-500/50 text-cyan-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
              {goalFreeText && (
                <p className="mt-3 text-sm text-zinc-300">{goalFreeText}</p>
              )}
            </>
          )}
          <button
            onClick={() => router.push('/onboard?edit=true')}
            className="mt-3 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Edit focus areas
          </button>
        </div>

        {/* Subscription */}
        <div className="border-t border-zinc-800 mt-10" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mt-4 mb-3">Subscription</h2>
        <div className="bg-zinc-900 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{planLabel}</p>
            {planDetail && <p className="text-sm text-zinc-500">{planDetail}</p>}
            {isPro ? (
              <p className="text-xs text-zinc-500 mt-0.5">Finished artifacts, every morning.</p>
            ) : (
              <p className="text-xs text-zinc-400 mt-0.5">Upgrade to unlock finished artifacts.</p>
            )}
          </div>
          {!isPro && (
            <button
              onClick={async () => {
                setUpgrading(true);
                try {
                  const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                  const d = await res.json().catch(() => ({}));
                  if (d.url) {
                    window.location.href = d.url;
                  } else {
                    setActionError('Could not start checkout. Try again.');
                    setUpgrading(false);
                  }
                } catch {
                  setActionError('Network error. Try again.');
                  setUpgrading(false);
                }
              }}
              disabled={upgrading}
              className="text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {upgrading ? 'Loading…' : 'Upgrade'}
            </button>
          )}
        </div>

        {/* Daily brief */}
        <div className="border-t border-zinc-800 mt-10" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mt-4 mb-3">Daily brief</h2>
        <div className="bg-zinc-900 rounded-xl p-4">
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
                  window.location.href = '/dashboard?generated=true';
                } else if (res.ok && data?.stages) {
                  const parts: string[] = [];
                  const stages = data.stages as Record<string, any>;
                  const signalFailed = stages.daily_brief?.signal_processing?.status === 'failed';
                  const genFailed = stages.daily_brief?.ok === false && stages.daily_brief?.generate?.status !== 'skipped' && !signalFailed;
                  if (signalFailed) parts.push('Signal processing incomplete — directives will improve as backlog clears');
                  if (genFailed) parts.push('Brief generation failed');
                  if (stages.sync_microsoft?.ok === false) parts.push('Microsoft sync failed');
                  if (stages.sync_google?.ok === false) parts.push('Google sync failed');
                  if (parts.length > 0) {
                    const isSignalBacklogOnly =
                      parts.length === 1 &&
                      parts[0].startsWith('Signal processing incomplete');
                    if (isSignalBacklogOnly) {
                      setGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                    } else {
                      setGenerateState('error');
                      setGenerateMessage(parts.join('. ') + '.');
                    }
                  } else {
                    setGenerateState('success');
                    window.location.href = '/dashboard?generated=true';
                  }
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
        <div className="border-t border-zinc-800 mt-10" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 mt-4 mb-3">Account</h2>
        {session?.user?.email && (
          <p className="text-sm text-zinc-500 mb-3">{session.user.email}</p>
        )}

        <button
          onClick={handleSignOut}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-3 text-sm font-medium transition-colors"
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
        <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm font-semibold text-white">Settings</span>
        <div className="w-5" />
      </div>
    </header>
  );
}

function GoogleIcon() {
  return (
    <div className="w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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
    <div className="w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}
