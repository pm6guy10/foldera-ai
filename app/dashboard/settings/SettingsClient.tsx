'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { ChevronLeft, LogOut } from 'lucide-react';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { OWNER_USER_ID } from '@/lib/auth/constants';

interface Integration {
  provider: string;
  is_active: boolean;
  sync_email?: string;
  scopes?: string | null;
  last_synced_at?: string | null;
  expires_at?: number | null;
  needs_reconnect?: boolean;
  /** Mail sync timestamp has not advanced for several days (connector may be stuck). */
  sync_stale?: boolean;
}

interface SubscriptionInfo {
  status: string;
  plan?: string;
  daysRemaining?: number;
  can_manage_billing?: boolean;
}

const ALL_BUCKETS = [
  'Job search', 'Career growth', 'Side project', 'Business ops',
  'Health & family', 'Financial', 'Relationships', 'Learning',
];

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const lastGenerateRef = useRef<number>(0);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [goalBuckets, setGoalBuckets] = useState<string[]>([]);
  const [goalFreeText, setGoalFreeText] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<'google' | 'microsoft' | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'microsoft' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [providerOAuthError, setProviderOAuthError] = useState<{ google: string | null; microsoft: string | null }>({
    google: null,
    microsoft: null,
  });
  const [upgrading, setUpgrading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [editingFocus, setEditingFocus] = useState(false);
  const [editBuckets, setEditBuckets] = useState<Set<string>>(new Set());
  const [editFreeText, setEditFreeText] = useState('');
  const [savingFocus, setSavingFocus] = useState(false);
  const [focusSaveError, setFocusSaveError] = useState<string | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState<boolean | null>(null);
  const [agentsSaving, setAgentsSaving] = useState(false);

  const isOwnerAccount = session?.user?.id === OWNER_USER_ID;

  const refreshIntegrationsStatus = useCallback(async () => {
    const response = await fetch('/api/integrations/status');
    if (!response.ok) {
      throw new Error('Could not refresh integrations status.');
    }

    const data = await response.json();
    setIntegrations(data.integrations || []);
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
      }
      if (subRes.ok) {
        setSubscription(await subRes.json());
      }
      if (goalsRes.ok) {
        const g = await goalsRes.json();
        setGoalBuckets(g.buckets ?? []);
        setGoalFreeText(g.freeText ?? null);
      }
    }).catch((err: unknown) => {
      console.error('[settings] failed to load initial data:', err instanceof Error ? err.message : err);
    }).finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (!isOwnerAccount) return;
    void fetch('/api/settings/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.enabled === 'boolean') setAgentsEnabled(j.enabled);
        else setAgentsEnabled(true);
      })
      .catch(() => setAgentsEnabled(true));
  }, [isOwnerAccount]);

  // Auto-sync after OAuth connection — makes the product feel alive on day one
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected') === 'true';
    const microsoftConnected = params.get('microsoft_connected') === 'true';
    const googleError = params.get('google_error');
    const microsoftError = params.get('microsoft_error');

    if (googleError) {
      setProviderOAuthError((p) => ({
        ...p,
        google: `Connection failed (${googleError.replace(/_/g, ' ')}).`,
      }));
    }
    if (microsoftError) {
      setProviderOAuthError((p) => ({
        ...p,
        microsoft: `Connection failed (${microsoftError.replace(/_/g, ' ')}).`,
      }));
    }

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    if (!googleConnected && !microsoftConnected) return;

    const provider = googleConnected ? 'google' : 'microsoft';
    const providerKey = googleConnected ? 'google' : 'azure_ad';
    const syncUrl = googleConnected ? '/api/google/sync-now' : '/api/microsoft/sync-now';

    // Optimistic: flip card to Connected immediately before sync finishes
    setIntegrations(prev => {
      const existing = prev.find(i => i.provider === providerKey);
      if (existing) {
        return prev.map(i => i.provider === providerKey ? { ...i, is_active: true } : i);
      }
      return [...prev, { provider: providerKey, is_active: true }];
    });

    setSyncStatus(`Syncing your ${provider === 'google' ? 'Google' : 'Microsoft'} data…`);

    fetch(syncUrl, { method: 'POST' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({ total: 0 }));
          await refreshIntegrationsStatus().catch((err: unknown) => {
            console.error('[settings] failed to refresh integration status after sync:', err instanceof Error ? err.message : err);
          });
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

  const handleEditFocus = () => {
    setEditBuckets(new Set(goalBuckets));
    setEditFreeText(goalFreeText ?? '');
    setFocusSaveError(null);
    setEditingFocus(true);
  };

  const handleSaveFocus = async () => {
    setSavingFocus(true);
    setFocusSaveError(null);
    try {
      const res = await fetch('/api/onboard/set-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buckets: Array.from(editBuckets),
          freeText: editFreeText.trim() || null,
          skipped: false,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFocusSaveError(typeof d.error === 'string' ? d.error : 'Could not save. Try again.');
        return;
      }
      setGoalBuckets(Array.from(editBuckets));
      setGoalFreeText(editFreeText.trim() || null);
      setEditingFocus(false);
    } catch {
      setFocusSaveError('Network error. Try again.');
    } finally {
      setSavingFocus(false);
    }
  };

  const google = integrations.find(i => i.provider === 'google');
  const microsoft = integrations.find(i => i.provider === 'azure_ad');

  const startGoogleOAuth = () => {
    setProviderOAuthError((p) => ({ ...p, google: null }));
    setConnectingProvider('google');
    localStorage.setItem('connecting_provider', 'google');
    window.location.href = '/api/google/connect';
  };

  const startMicrosoftOAuth = () => {
    setProviderOAuthError((p) => ({ ...p, microsoft: null }));
    setConnectingProvider('microsoft');
    localStorage.setItem('connecting_provider', 'microsoft');
    window.location.href = '/api/microsoft/connect';
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
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
      <div className="min-h-screen bg-[#07070c]">
        <Header onSignOut={handleSignOut} />
        <main id="main" className="pt-20 pb-10 px-4 max-w-3xl mx-auto">
          <div className="animate-pulse space-y-4 mt-8">
            <div className="h-3 w-32 bg-zinc-800/60 rounded" />
            <div className="h-24 bg-zinc-900/40 rounded-2xl" />
            <div className="h-24 bg-zinc-900/40 rounded-2xl" />
            <div className="h-3 w-24 bg-zinc-800/60 rounded mt-6" />
            <div className="h-28 bg-zinc-900/40 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-[#07070c]">
        <Header onSignOut={handleSignOut} />
        <main id="main" className="pt-20 pb-10 px-4 max-w-3xl mx-auto">
          <p className="text-zinc-500 text-sm mt-8">Please sign in to view settings.</p>
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
    <div className="min-h-[100dvh] bg-[#07070c] text-white selection:bg-cyan-500/30 selection:text-white pb-[env(safe-area-inset-bottom,0px)]">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>
      <Header onSignOut={handleSignOut} />
      <main
        id="main"
        className="relative z-10 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-16 sm:pb-14 px-4 max-w-3xl mx-auto space-y-9 sm:space-y-10 w-full min-w-0"
      >

        {/* Sync status banner */}
        {syncStatus && (
          <div className="px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-sm">
            <p className="text-sm text-cyan-300">{syncStatus}</p>
          </div>
        )}

        {actionError && (
          <p ref={errorRef} className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">{actionError}</p>
        )}

        {/* ── Connected accounts ── */}
        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <SectionHeading className="mb-2">Connected accounts</SectionHeading>
            <p className="text-xs text-zinc-600 leading-relaxed">Connect Google and Microsoft so Foldera can keep your model current.</p>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 space-y-4">
            {/* Google card */}
            <div className={`rounded-2xl border border-white/10 overflow-hidden min-h-[5.75rem] ${google?.is_active ? 'border-l-2 border-l-emerald-500' : ''}`}>
              <div className="bg-zinc-950/60 p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-h-[5.75rem]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <GoogleIcon />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Google</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${google?.is_active ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
                      <p className={`text-xs truncate ${google?.is_active ? 'text-zinc-300' : 'text-amber-200/80'}`}>
                        {google?.is_active ? 'Connected' : 'Not connected'}
                        {google?.is_active && google.sync_email ? ` · ${google.sync_email}` : ''}
                      </p>
                    </div>
                    {google?.is_active && google.needs_reconnect && (
                      <p className="text-[11px] text-amber-200/90 mt-1.5 leading-snug">
                        Reconnect required — Foldera can&apos;t refresh this connection in the background without a new sign-in.
                      </p>
                    )}
                    {google?.is_active && google.sync_stale && !google.needs_reconnect && (
                      <p className="text-[11px] text-amber-200/90 mt-1.5 leading-snug">
                        Sync looks stalled — last mail sync was a while ago. Disconnect and reconnect if new mail isn&apos;t showing up.
                      </p>
                    )}
                    {google?.is_active && formatLastSynced(google.last_synced_at) && (
                      <p className="text-[10px] text-zinc-600 mt-1 font-medium">
                        Last synced {formatLastSynced(google.last_synced_at)} Pacific
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col w-full md:w-auto md:items-end gap-2 shrink-0">
                  {google?.is_active && (google.needs_reconnect || google.sync_stale) && (
                    <button
                      type="button"
                      onClick={startGoogleOAuth}
                      disabled={connectingProvider === 'google'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-cyan-500 text-black hover:bg-cyan-400 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {connectingProvider === 'google' ? 'Opening…' : 'Reconnect'}
                    </button>
                  )}
                  {google?.is_active ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setDisconnecting('google');
                        setActionError(null);
                        setIntegrations(prev => prev.filter(i => i.provider !== 'google'));
                        try {
                          const response = await fetch('/api/google/disconnect', { method: 'POST' });
                          if (!response.ok) {
                            setActionError('Could not disconnect Google. Try again.');
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
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] border border-white/10 hover:border-white/20 text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {disconnecting === 'google' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startGoogleOAuth}
                      disabled={connectingProvider === 'google'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg transition-all duration-150 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-wait disabled:hover:scale-100 shadow-[0_0_20px_rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {connectingProvider === 'google' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              {providerOAuthError.google && (
                <div className="px-4 py-3 border-t border-white/5 bg-red-500/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-red-200/90">{providerOAuthError.google}</p>
                  <button
                    type="button"
                    onClick={startGoogleOAuth}
                    disabled={connectingProvider === 'google'}
                    className="shrink-0 min-h-[40px] text-[10px] font-black uppercase tracking-[0.12em] bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg disabled:opacity-40"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* Microsoft card */}
            <div className={`rounded-2xl border border-white/10 overflow-hidden ${microsoft?.is_active ? 'border-l-2 border-l-cyan-400' : ''}`}>
              <div className="bg-zinc-950/60 p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <MicrosoftIcon />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Microsoft</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${microsoft?.is_active ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
                      <p className={`text-xs truncate ${microsoft?.is_active ? 'text-zinc-300' : 'text-amber-200/80'}`}>
                        {microsoft?.is_active ? 'Connected' : 'Not connected'}
                        {microsoft?.is_active && microsoft.sync_email ? ` · ${microsoft.sync_email}` : ''}
                      </p>
                    </div>
                    {microsoft?.is_active && microsoft.needs_reconnect && (
                      <p className="text-[11px] text-amber-200/90 mt-1.5 leading-snug">
                        Reconnect required — Foldera can&apos;t refresh this connection in the background without a new sign-in.
                      </p>
                    )}
                    {microsoft?.is_active && microsoft.sync_stale && !microsoft.needs_reconnect && (
                      <p className="text-[11px] text-amber-200/90 mt-1.5 leading-snug">
                        Sync looks stalled — last mail sync was a while ago. Disconnect and reconnect Microsoft to pull recent mail.
                      </p>
                    )}
                    {microsoft?.is_active && formatLastSynced(microsoft.last_synced_at) && (
                      <p className="text-[10px] text-zinc-600 mt-1 font-medium">
                        Last synced {formatLastSynced(microsoft.last_synced_at)} Pacific
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col w-full md:w-auto md:items-end gap-2 shrink-0">
                  {microsoft?.is_active && (microsoft.needs_reconnect || microsoft.sync_stale) && (
                    <button
                      type="button"
                      onClick={startMicrosoftOAuth}
                      disabled={connectingProvider === 'microsoft'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-cyan-500 text-black hover:bg-cyan-400 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {connectingProvider === 'microsoft' ? 'Opening…' : 'Reconnect'}
                    </button>
                  )}
                  {microsoft?.is_active ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setDisconnecting('microsoft');
                        setActionError(null);
                        setIntegrations(prev => prev.map(i =>
                          i.provider === 'azure_ad' ? { ...i, is_active: false, sync_email: undefined } : i
                        ));
                        try {
                          const response = await fetch('/api/microsoft/disconnect', { method: 'POST' });
                          if (!response.ok) {
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
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] border border-white/10 hover:border-white/20 text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {disconnecting === 'microsoft' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startMicrosoftOAuth}
                      disabled={connectingProvider === 'microsoft'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg transition-all duration-150 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-wait disabled:hover:scale-100 shadow-[0_0_20px_rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                    >
                      {connectingProvider === 'microsoft' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              {providerOAuthError.microsoft && (
                <div className="px-4 py-3 border-t border-white/5 bg-red-500/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-red-200/90">{providerOAuthError.microsoft}</p>
                  <button
                    type="button"
                    onClick={startMicrosoftOAuth}
                    disabled={connectingProvider === 'microsoft'}
                    className="shrink-0 min-h-[40px] text-[10px] font-black uppercase tracking-[0.12em] bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-lg disabled:opacity-40"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Focus areas ── */}
        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <SectionHeading className="mb-2">Focus areas</SectionHeading>
            <p className="text-xs text-zinc-600 leading-relaxed">What Foldera optimizes for.</p>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6">
            {!editingFocus ? (
              <>
                {activeBuckets.length === 0 && !goalFreeText ? (
                  <p className="text-sm text-zinc-500">No focus areas set.</p>
                ) : (
                  <>
                    {activeBuckets.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {activeBuckets.map((label) => (
                          <span
                            key={label}
                            className="rounded-lg py-1.5 px-3 text-xs font-black uppercase tracking-[0.1em] bg-cyan-500/10 border border-cyan-500/30 text-cyan-300"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {goalFreeText && (
                      <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 mr-2">Goal:</span>
                        {goalFreeText}
                      </p>
                    )}
                  </>
                )}
                <button
                  onClick={handleEditFocus}
                  className="mt-4 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Edit focus areas →
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_BUCKETS.map((label) => {
                    const active = editBuckets.has(label);
                    return (
                      <button
                        key={label}
                        onClick={() => {
                          setEditBuckets(prev => {
                            const next = new Set(prev);
                            if (next.has(label)) next.delete(label);
                            else next.add(label);
                            return next;
                          });
                        }}
                        className={`rounded-xl py-2.5 px-3 text-xs font-black uppercase tracking-[0.08em] transition-colors border text-left ${
                          active
                            ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                            : 'bg-zinc-900/60 border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-400'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={editFreeText}
                  onChange={(e) => setEditFreeText(e.target.value)}
                  placeholder="e.g., land the MAS3 role at HCA"
                  className="mt-3 w-full min-h-[44px] bg-zinc-900/60 border border-white/10 rounded-xl py-2.5 px-3 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
                />
                {focusSaveError && (
                  <p className="mt-2 text-xs text-red-400">{focusSaveError}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleSaveFocus}
                    disabled={savingFocus}
                    className="flex-1 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-wait rounded-xl py-2.5 text-xs font-black uppercase tracking-[0.12em] transition-colors"
                  >
                    {savingFocus ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingFocus(false)}
                    disabled={savingFocus}
                    className="flex-1 bg-zinc-900/60 hover:bg-zinc-800/60 border border-white/10 text-zinc-400 rounded-xl py-2.5 text-xs font-black uppercase tracking-[0.12em] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Generate Now (prominent) ── */}
        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <SectionHeading className="mb-2">Generate</SectionHeading>
            <p className="text-xs text-zinc-600 leading-relaxed">Sync your data and generate today&apos;s brief. Takes up to 60 seconds.</p>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6">
            <button
              disabled={generateState === 'loading' || generateState === 'success'}
              onClick={async () => {
                const now = Date.now();
                if (now - lastGenerateRef.current < 30_000) {
                  setGenerateMessage('Please wait 30 seconds before trying again.');
                  return;
                }
                lastGenerateRef.current = now;
                setGenerateState('loading');
                setGenerateMessage(null);
                try {
                  const res = await fetch('/api/settings/run-brief', { method: 'POST' });
                  const data = await res.json().catch(() => null);
                  if (res.ok && data?.ok) {
                    setGenerateState('success');
                    window.location.href = '/dashboard?generated=true';
                    return;
                  }
                  if (res.ok && data?.stages) {
                    const stages = data.stages as Record<string, any>;
                    const genStatus = stages.daily_brief?.generate?.status;
                    if (genStatus === 'ok') {
                      setGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const signalOnly = stages.daily_brief?.signal_processing?.status === 'failed' && genStatus !== 'failed';
                    if (signalOnly) {
                      setGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const parts: string[] = [];
                    if (genStatus === 'failed') parts.push('Brief generation failed');
                    if (stages.sync_microsoft?.ok === false) parts.push('Microsoft sync issue');
                    if (stages.sync_google?.ok === false) parts.push('Google sync issue');
                    setGenerateState('error');
                    setGenerateMessage(parts.length > 0 ? parts.join('. ') + '.' : 'Something went wrong.');
                    return;
                  }
                  setGenerateState('error');
                  setGenerateMessage(data?.error || 'Request failed. Try again in 30 seconds.');
                } catch {
                  setGenerateState('error');
                  setGenerateMessage('Network error — try again in 30 seconds.');
                }
              }}
              className={`w-full min-h-[52px] touch-manipulation rounded-xl py-4 text-xs font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${
                generateState === 'loading'
                  ? 'bg-zinc-800/60 text-zinc-500 cursor-wait border border-white/5'
                  : generateState === 'success'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 cursor-default'
                    : 'bg-white text-black hover:bg-zinc-200 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {generateState === 'loading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Running sync + generate…
                </>
              ) : generateState === 'success' ? 'Redirecting…' : 'Generate now'}
            </button>
            {generateMessage && (
              <p className={`mt-3 text-xs leading-relaxed ${generateState === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>
                {generateMessage}
              </p>
            )}
          </div>
        </section>

        {/* ── Subscription ── */}
        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <SectionHeading className="!mb-0">Subscription</SectionHeading>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.15em] ${isPro ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-zinc-500 border border-white/10'}`}>
                {planLabel}
              </div>
              <div>
                {planDetail && (
                  <p className={`text-xs font-medium ${subscription?.status === 'past_due' ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {planDetail}
                  </p>
                )}
                <p className="text-xs text-zinc-600">
                  {isPro ? 'Finished artifacts, every morning.' : 'Upgrade to unlock finished artifacts.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isPro && subscription?.can_manage_billing && (
                <button
                  type="button"
                  onClick={async () => {
                    setPortalLoading(true);
                    setActionError(null);
                    try {
                      const res = await fetch('/api/stripe/portal', { method: 'POST' });
                      const d = await res.json().catch(() => ({}));
                      if (d.url) {
                        window.location.href = d.url;
                      } else {
                        setActionError(typeof d.error === 'string' ? d.error : 'Could not open billing portal.');
                        setPortalLoading(false);
                      }
                    } catch {
                      setActionError('Network error. Try again.');
                      setPortalLoading(false);
                    }
                  }}
                  disabled={portalLoading}
                  className="text-[10px] font-black uppercase tracking-[0.12em] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-white/10 rounded-lg px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {portalLoading ? 'Loading…' : 'Manage subscription'}
                </button>
              )}
              {!isPro && (
                <button
                  type="button"
                  onClick={async () => {
                    setUpgrading(true);
                    try {
                      const res = await fetch('/api/stripe/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: session?.user?.id,
                          email: session?.user?.email ?? undefined,
                        }),
                      });
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
                  className="text-[10px] font-black uppercase tracking-[0.12em] bg-white text-black hover:bg-zinc-200 rounded-lg px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-wait shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  {upgrading ? 'Loading…' : 'Upgrade'}
                </button>
              )}
            </div>
          </div>
        </section>

        {isOwnerAccount && agentsEnabled !== null && (
          <section className="rounded-2xl border border-emerald-500/20 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
            <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
              <SectionHeading className="mb-2">Autonomous agents</SectionHeading>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Scheduled jobs stage drafts on your dashboard System tab. Turn off to stop all agent runs immediately.
              </p>
            </div>
            <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-300">Agents enabled</p>
              <button
                type="button"
                disabled={agentsSaving}
                onClick={async () => {
                  setAgentsSaving(true);
                  try {
                    const next = !agentsEnabled;
                    const res = await fetch('/api/settings/agents', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: next }),
                    });
                    if (res.ok) {
                      setAgentsEnabled(next);
                    }
                  } finally {
                    setAgentsSaving(false);
                  }
                }}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  agentsEnabled ? 'bg-emerald-500/80' : 'bg-zinc-700'
                } ${agentsSaving ? 'opacity-50' : ''}`}
                aria-pressed={agentsEnabled}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    agentsEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </section>
        )}

        {/* ── Account ── */}
        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <SectionHeading className="!mb-0">Account</SectionHeading>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 space-y-4">
            {session?.user?.email && (
              <div className="rounded-xl bg-zinc-900/40 border border-white/5 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 mb-1">Signed in as</p>
                <p className="text-sm text-zinc-300 font-medium break-all">{session.user.email}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="w-full min-h-[48px] border border-red-900/40 hover:border-red-700/60 bg-transparent hover:bg-red-950/10 text-red-500/70 hover:text-red-400 rounded-xl py-3 text-xs font-black uppercase tracking-[0.12em] transition-colors"
            >
              {deleteConfirm ? 'Tap again to confirm deletion' : 'Delete account'}
            </button>
            {deleteError && (
              <p className="text-xs text-red-400">{deleteError}</p>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}

function SectionHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 ${className}`}>
      {children}
    </h2>
  );
}

function formatLastSynced(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  } catch {
    return null;
  }
}

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-3xl mx-auto h-14 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-3 sm:px-4 gap-1 sm:gap-2">
        <div className="flex justify-start min-w-0">
          <Link
            href="/dashboard"
            className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 min-h-[44px] min-w-[44px] -ml-1 pl-1 pr-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="text-xs font-black uppercase tracking-[0.12em] truncate max-w-[6rem] sm:max-w-none">
              Dashboard
            </span>
          </Link>
        </div>
        <div className="flex justify-center">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 group min-h-[44px] min-w-[44px] justify-center rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            aria-label="Foldera"
          >
            <FolderaMark
              size="sm"
              className="shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform group-hover:scale-105 shrink-0"
            />
            <span className="text-sm font-black tracking-tighter text-white uppercase hidden sm:inline">Foldera</span>
          </Link>
        </div>
        <div className="flex justify-end min-w-0">
          <button
            type="button"
            onClick={onSignOut}
            className="touch-manipulation flex items-center gap-1.5 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-[0.12em] shrink-0 min-h-[44px] min-w-[44px] sm:min-w-0 px-2 rounded-lg justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline truncate">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function GoogleIcon() {
  return (
    <div className="w-9 h-9 bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center shrink-0">
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
    <div className="w-9 h-9 bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}
