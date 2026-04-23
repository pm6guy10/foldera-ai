'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useSession, signOut } from 'next-auth/react';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { OWNER_USER_ID, SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';

interface Integration {
  provider: string;
  is_active: boolean;
  sync_email?: string;
  scopes?: string | null;
  last_synced_at?: string | null;
  expires_at?: number | null;
  needs_reconnect?: boolean;
  needs_reauth?: boolean;
  missing_scopes?: string[];
  /** Mail sync timestamp has not advanced for several days (connector may be stuck). */
  sync_stale?: boolean;
}

interface SubscriptionInfo {
  status: string;
  plan?: string;
  daysRemaining?: number;
  can_manage_billing?: boolean;
}

interface GraphStats {
  lastSignalAt: string | null;
  lastSignalSource: string | null;
}

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
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
  /** True when connected mail graph has no recent processed mail signals (ingest may be empty despite cron). */
  const [mailIngestLooksStale, setMailIngestLooksStale] = useState(false);
  const [newestMailSignalAt, setNewestMailSignalAt] = useState<string | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);

  const isOwnerAccount = session?.user?.id === OWNER_USER_ID;

  /** Bumps on each integrations fetch so a slower in-flight GET cannot overwrite a newer refresh (OAuth return vs initial load). */
  const integrationsFetchGenRef = useRef(0);

  const refreshIntegrationsStatus = useCallback(async () => {
    const gen = ++integrationsFetchGenRef.current;
    const response = await fetch('/api/integrations/status', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Could not refresh integrations status.');
    }

    const data = await response.json();
    if (gen !== integrationsFetchGenRef.current) return;
    setIntegrations(data.integrations || []);
    if (typeof data.mail_ingest_looks_stale === 'boolean') {
      setMailIngestLooksStale(data.mail_ingest_looks_stale);
    }
    setNewestMailSignalAt(
      typeof data.newest_mail_signal_at === 'string' ? data.newest_mail_signal_at : null,
    );
  }, []);

  const refreshGraphStats = useCallback(async () => {
    const response = await fetch('/api/graph/stats', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Could not refresh source status.');
    }
    const data = await response.json();
    setGraphStats({
      lastSignalAt: typeof data?.lastSignalAt === 'string' ? data.lastSignalAt : null,
      lastSignalSource: typeof data?.lastSignalSource === 'string' ? data.lastSignalSource : null,
    });
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
    const intGen = ++integrationsFetchGenRef.current;
    Promise.all([
      fetch('/api/integrations/status', { cache: 'no-store' }),
      fetch('/api/subscription/status'),
      fetch('/api/graph/stats', { cache: 'no-store' }),
    ]).then(async ([intRes, subRes, graphRes]) => {
      if (intRes.ok) {
        const d = await intRes.json();
        if (intGen === integrationsFetchGenRef.current) {
          setIntegrations(d.integrations || []);
          if (typeof d.mail_ingest_looks_stale === 'boolean') {
            setMailIngestLooksStale(d.mail_ingest_looks_stale);
          }
          setNewestMailSignalAt(
            typeof d.newest_mail_signal_at === 'string' ? d.newest_mail_signal_at : null,
          );
        }
      }
      if (graphRes.ok) {
        const graph = await graphRes.json();
        setGraphStats({
          lastSignalAt: typeof graph?.lastSignalAt === 'string' ? graph.lastSignalAt : null,
          lastSignalSource: typeof graph?.lastSignalSource === 'string' ? graph.lastSignalSource : null,
        });
      } else {
        setGraphStats(null);
      }
      if (subRes.ok) {
        setSubscription(await subRes.json());
      }
    }).catch((err: unknown) => {
      console.error('[settings] failed to load initial data:', err instanceof Error ? err.message : err);
    }).finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const reconnect = params.get('reconnect');
    if (reconnect === 'microsoft' || reconnect === 'onedrive') {
      window.history.replaceState({}, '', window.location.pathname);
      localStorage.setItem('connecting_provider', 'microsoft');
      window.location.href = '/api/microsoft/connect';
      return;
    }
    if (reconnect === 'google') {
      window.history.replaceState({}, '', window.location.pathname);
      localStorage.setItem('connecting_provider', 'google');
      window.location.href = '/api/google/connect';
      return;
    }
  }, [status]);

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

    const hadOAuthCallback =
      googleConnected || microsoftConnected || googleError !== null || microsoftError !== null;
    if (hadOAuthCallback) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (!googleConnected && !microsoftConnected) return;

    const provider = googleConnected ? 'google' : 'microsoft';

    void (async () => {
      await refreshIntegrationsStatus().catch((err: unknown) => {
        console.error(
          '[settings] failed to refresh integration status after OAuth callback:',
          err instanceof Error ? err.message : err,
        );
      });
      await refreshGraphStats().catch(() => {});

      setSyncStatus(
        `${provider === 'google' ? 'Google' : 'Microsoft'} connected. Scheduled sync will pick this up shortly.`,
      );
      setTimeout(() => setSyncStatus(null), 6000);
    })();
  }, [status, refreshIntegrationsStatus, refreshGraphStats]);

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
  const activeIntegrationCount = integrations.filter((integration) => integration.is_active).length;
  const firstConnectedIntegration = integrations.find((integration) => integration.is_active);
  const firstRunIntegration = firstConnectedIntegration ?? integrations[0];
  const firstRunStatus = buildFirstRunStatus(firstRunIntegration);
  const latestSignalLabel = graphStats?.lastSignalAt
    ? `${providerDisplayName(graphStats.lastSignalSource)} · ${formatRelativeTime(graphStats.lastSignalAt)}`
    : 'No signal yet';

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
    signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL });
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (res.ok) {
        await signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL });
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
      <ProductShell title="Settings" subtitle="Manage integrations, billing, and account controls from one place.">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-32 rounded bg-panel-raised" />
          <div className="h-24 rounded-card bg-panel" />
          <div className="h-24 rounded-card bg-panel" />
          <div className="h-3 w-24 rounded bg-panel-raised" />
          <div className="h-28 rounded-card bg-panel" />
        </div>
      </ProductShell>
    );
  }

  if (status !== 'authenticated') {
    return (
      <ProductShell title="Settings" subtitle="Manage integrations, billing, and account controls from one place.">
        <p className="text-sm text-text-secondary">Please sign in to view settings.</p>
      </ProductShell>
    );
  }

  const isPro = subscription?.plan === 'pro';
  const planLabel = isPro ? 'Pro' : 'Free';
  const planDetail =
    subscription?.status === 'active' ? 'Active' :
    subscription?.status === 'past_due' ? 'Payment past due'
    : '';

  return (
    <ProductShell
      title="Settings"
      subtitle="Manage integrations, billing, and account controls from one place."
      headerActions={(
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-button border border-border px-3 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      )}
    >

      <div className="space-y-6">
        {/* ── Connected accounts ── */}
        <section id="connected-accounts" className="rounded-card border border-border bg-panel overflow-hidden">
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 border-b border-border-subtle">
            <SectionHeading className="mb-2">Connected accounts</SectionHeading>
            <p className="text-xs text-text-muted leading-relaxed">
              Connect Google and Microsoft mail so Foldera can read context for your morning brief.
            </p>
          </div>
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 space-y-4">
            {syncStatus && (
              <div className="rounded-card border border-border bg-panel-raised px-4 py-3">
                <p className="text-sm text-text-primary">{syncStatus}</p>
              </div>
            )}

            {actionError && (
              <p
                ref={errorRef}
                className="rounded-card border border-border-strong bg-panel-raised px-4 py-3 text-sm text-text-primary"
              >
                {actionError}
              </p>
            )}

            {integrations.length > 0 && (
              <div className="rounded-card border border-border bg-panel-raised px-4 py-4 sm:px-5">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-accent">Connection status</p>
                <p className="mt-2 text-sm leading-relaxed text-text-primary">{firstRunStatus.headline}</p>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">{firstRunStatus.detail}</p>
                {firstRunStatus.missingScopes.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                    {firstRunStatus.missingScopesLabel}
                  </p>
                )}
              </div>
            )}

            {mailIngestLooksStale && (
              <div className="rounded-card border border-border-strong bg-panel-raised px-4 py-3">
                <p className="text-sm text-text-secondary leading-relaxed">
                  Newest mail synced from your inboxes is dated{' '}
                  {newestMailSignalAt
                    ? new Date(newestMailSignalAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                    : '— none on file yet'}
                  . If you have exchanged mail since then, reconnect below so new messages reach Foldera.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-card border border-border bg-panel-raised p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Connected sources</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-text-primary">{activeIntegrationCount}</p>
              </article>
              <article className="rounded-card border border-border bg-panel-raised p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Latest source signal</p>
                <p className="mt-2 text-sm leading-relaxed text-text-primary">{latestSignalLabel}</p>
              </article>
            </div>

            <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-text-secondary">Legacy route: `/dashboard/signals` is still available if bookmarked.</p>
              <Link
                href="/dashboard/signals"
                className="inline-flex min-h-[40px] items-center rounded-button border border-border px-3 text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
              >
                Open legacy signals view
              </Link>
            </div>

            {/* Google card */}
            <div className={`rounded-2xl rounded-card border border-border overflow-hidden min-h-[5.75rem] ${google?.is_active ? 'border-l-2 border-l-success' : ''}`}>
              <div className="bg-panel-raised p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-h-[5.75rem]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <GoogleIcon />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary">Google</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${google?.is_active ? 'bg-success' : 'bg-border-strong'}`} aria-hidden="true" />
                      <p className={`text-xs truncate ${google?.is_active ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {google?.is_active ? 'Connected' : 'Not connected'}
                        {google?.is_active && google.sync_email ? ` · ${google.sync_email}` : ''}
                      </p>
                    </div>
                    {!google?.is_active && google?.needs_reauth && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Google needs a quick reconnect to resume background sync. Tap Connect and Foldera will pick back up.
                      </p>
                    )}
                    {google?.is_active && google.missing_scopes?.length ? (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Reconnect required — missing {formatMissingScopes(google.missing_scopes)}.
                      </p>
                    ) : null}
                    {google?.is_active && !google.missing_scopes?.length && !google.last_synced_at && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Connected. Foldera is reading your connected sources and looking for the one thing silently blocking your real goal.
                      </p>
                    )}
                    {google?.is_active && google.needs_reconnect && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Reconnect required — Foldera can&apos;t keep reading this source in the background without a new sign-in.
                      </p>
                    )}
                    {google?.is_active && google.sync_stale && !google.needs_reconnect && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Sync looks stalled — Foldera hasn&apos;t seen new history in a while. Disconnect and reconnect if new mail isn&apos;t showing up.
                      </p>
                    )}
                    {google?.is_active && formatLastSynced(google.last_synced_at) && (
                      <p className="text-[10px] text-text-muted mt-1 font-medium">
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
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-3 py-2 rounded-button transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
                          }
                        } catch {
                          setActionError('Network error disconnecting Google.');
                        } finally {
                          await refreshIntegrationsStatus().catch(() => {});
                          await refreshGraphStats().catch(() => {});
                          setDisconnecting(null);
                        }
                      }}
                      disabled={disconnecting === 'google'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] border border-border hover:border-border-strong text-text-secondary hover:text-text-primary px-3 py-2 rounded-button transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      {disconnecting === 'google' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startGoogleOAuth}
                      disabled={connectingProvider === 'google'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-4 py-2 rounded-button transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      {connectingProvider === 'google' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              {providerOAuthError.google && (
                <div className="px-4 py-3 border-t border-border-subtle bg-panel-raised flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-text-secondary">{providerOAuthError.google}</p>
                  <button
                    type="button"
                    onClick={startGoogleOAuth}
                    disabled={connectingProvider === 'google'}
                    className="shrink-0 min-h-[40px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-4 py-2 rounded-button disabled:opacity-40"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* Microsoft card */}
            <div className={`rounded-2xl rounded-card border border-border overflow-hidden ${microsoft?.is_active ? 'border-l-2 border-l-accent' : ''}`}>
              <div className="bg-panel-raised p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <MicrosoftIcon />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary">Microsoft</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${microsoft?.is_active ? 'bg-success' : 'bg-border-strong'}`} aria-hidden="true" />
                      <p className={`text-xs truncate ${microsoft?.is_active ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {microsoft?.is_active ? 'Connected' : 'Not connected'}
                        {microsoft?.is_active && microsoft.sync_email ? ` · ${microsoft.sync_email}` : ''}
                      </p>
                    </div>
                    {!microsoft?.is_active && microsoft?.needs_reauth && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Microsoft needs a quick reconnect to resume background sync. Tap Connect and Foldera will pick back up.
                      </p>
                    )}
                    {microsoft?.is_active && microsoft.missing_scopes?.length ? (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Reconnect required — missing {formatMissingScopes(microsoft.missing_scopes)}.
                      </p>
                    ) : null}
                    {microsoft?.is_active && !microsoft.missing_scopes?.length && !microsoft.last_synced_at && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Connected. Foldera is reading your connected sources and looking for the one thing silently blocking your real goal.
                      </p>
                    )}
                    {microsoft?.is_active && microsoft.needs_reconnect && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Reconnect required — Foldera can&apos;t keep reading this source in the background without a new sign-in.
                      </p>
                    )}
                    {microsoft?.is_active && microsoft.sync_stale && !microsoft.needs_reconnect && (
                      <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">
                        Sync looks stalled — Foldera hasn&apos;t seen new history in a while. Disconnect and reconnect Microsoft to pull recent history.
                      </p>
                    )}
                    {microsoft?.is_active && formatLastSynced(microsoft.last_synced_at) && (
                      <p className="text-[10px] text-text-muted mt-1 font-medium">
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
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-3 py-2 rounded-button transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
                          }
                        } catch {
                          setActionError('Network error disconnecting Microsoft.');
                        } finally {
                          await refreshIntegrationsStatus().catch(() => {});
                          await refreshGraphStats().catch(() => {});
                          setDisconnecting(null);
                        }
                      }}
                      disabled={disconnecting === 'microsoft'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] border border-border hover:border-border-strong text-text-secondary hover:text-text-primary px-3 py-2 rounded-button transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      {disconnecting === 'microsoft' ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startMicrosoftOAuth}
                      disabled={connectingProvider === 'microsoft'}
                      className="w-full md:w-auto min-h-[48px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-4 py-2 rounded-button transition-colors disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                      {connectingProvider === 'microsoft' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              {providerOAuthError.microsoft && (
                <div className="px-4 py-3 border-t border-border-subtle bg-panel-raised flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-xs text-text-secondary">{providerOAuthError.microsoft}</p>
                  <button
                    type="button"
                    onClick={startMicrosoftOAuth}
                    disabled={connectingProvider === 'microsoft'}
                    className="shrink-0 min-h-[40px] text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover px-4 py-2 rounded-button disabled:opacity-40"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Subscription ── */}
        <section className="rounded-card border border-border bg-panel overflow-hidden">
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 border-b border-border-subtle">
            <SectionHeading className="!mb-0">Subscription</SectionHeading>
          </div>
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-button text-[10px] font-black uppercase tracking-[0.15em] ${isPro ? 'bg-accent-dim/20 text-accent border border-accent-dim' : 'bg-panel-raised text-text-secondary border border-border'}`}>
                {planLabel}
              </div>
              <div>
                {planDetail && (
                  <p className={`text-xs font-medium ${subscription?.status === 'past_due' ? 'text-text-secondary' : 'text-text-secondary'}`}>
                    {planDetail}
                  </p>
                )}
                <p className="text-xs text-text-muted">
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
                  className="text-[10px] font-black uppercase tracking-[0.12em] bg-panel-raised text-text-primary hover:bg-panel border border-border rounded-button px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-wait"
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
                  className="text-[10px] font-black uppercase tracking-[0.12em] bg-accent text-bg hover:bg-accent-hover rounded-button px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {upgrading ? 'Loading…' : 'Upgrade'}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Account ── */}
        <section className="rounded-card border border-border bg-panel overflow-hidden">
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 border-b border-border-subtle">
            <SectionHeading className="!mb-0">Account</SectionHeading>
          </div>
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 space-y-4">
            {session?.user?.email && (
              <div className="rounded-card bg-panel-raised border border-border-subtle px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-text-muted mb-1">Signed in as</p>
                <p className="text-sm text-text-primary font-medium break-all">{session.user.email}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-card border border-border bg-panel-raised hover:bg-panel text-text-primary py-3 text-xs font-black uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </section>

        {/* ── Danger zone ── */}
        <section className="rounded-card border border-border bg-panel overflow-hidden">
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 border-b border-border-subtle">
            <SectionHeading className="!mb-0 text-text-primary">Danger zone</SectionHeading>
          </div>
          <div className="px-4 py-6 sm:px-6 sm:py-6 md:px-6 space-y-3">
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="w-full min-h-[48px] border border-border-strong hover:border-border-strong bg-transparent hover:bg-panel text-text-primary hover:text-text-primary rounded-card py-3 text-xs font-black uppercase tracking-[0.12em] transition-colors"
            >
              {deleteConfirm ? 'Tap again to confirm deletion' : 'Delete account'}
            </button>
            {deleteError && (
              <p className="text-xs text-text-primary">{deleteError}</p>
            )}
          </div>
        </section>

        {isOwnerAccount && (
          <aside className="rounded-card border border-border-subtle bg-panel-raised/70 px-4 py-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Owner only</p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Pipeline controls are intentionally separate from the customer settings flow.
            </p>
            <Link
              href="/dashboard/system"
              className="mt-3 inline-flex min-h-[40px] items-center rounded-button border border-border px-3 text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
            >
              Open system tools
            </Link>
          </aside>
        )}
      </div>

    </ProductShell>
  );
}

function SectionHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-6 ${className}`}>
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

function formatMissingScopes(scopes: string[]): string {
  if (scopes.length === 0) return '';
  if (scopes.length === 1) return scopes[0];
  if (scopes.length === 2) return `${scopes[0]} and ${scopes[1]}`;
  return `${scopes.slice(0, -1).join(', ')}, and ${scopes[scopes.length - 1]}`;
}

function buildFirstRunStatus(integration: Integration | undefined): {
  headline: string;
  detail: string;
  missingScopes: string[];
  missingScopesLabel: string;
  steps: Array<{ label: string; copy: string }>;
} {
  if (!integration) {
    return {
      headline: 'Connect one source and Foldera gets to work.',
      detail: 'Once a provider is connected, Foldera reads recent history, then shows the first value when it is ready. No extra setup required.',
      missingScopes: [],
      missingScopesLabel: '',
      steps: [
        { label: 'Connect', copy: 'Sign in with Google or Microsoft.' },
        { label: 'Read', copy: 'Foldera reads recent history for the one thing that matters.' },
        { label: 'First value', copy: 'Your first value arrives when the first read is ready.' },
      ],
    };
  }

  const missingScopes = integration.missing_scopes ?? [];
  const isWarm = Boolean(integration.last_synced_at);
  const providerName = providerDisplayName(integration.provider);

  if (missingScopes.length > 0) {
    return {
      headline: `${providerName} is connected, but Foldera needs one more consent step to keep reading.`,
      detail: 'Reconnect to grant the missing permissions so Foldera can keep reading your connected sources and finish the first pass. No extra setup required.',
      missingScopes,
      missingScopesLabel: `Reconnect ${providerName} to restore ${formatMissingScopes(missingScopes)}.`,
      steps: [
        { label: 'Connected', copy: `${providerName} is linked to ${integration.sync_email ?? 'your account'}.` },
        { label: 'Reconnect', copy: 'Foldera will ask for the missing permissions only.' },
        { label: 'Resume', copy: 'After reconnect, Foldera keeps reading in the background.' },
      ],
    };
  }

  if (!isWarm) {
    return {
      headline: `${providerName} is connected and Foldera is reading recent history now.`,
      detail: 'No extra setup required. Foldera is reading the connected source so it can surface one finished move instead of a to-do list.',
      missingScopes,
      missingScopesLabel: '',
      steps: [
        { label: 'Connected', copy: `${providerName} is linked to ${integration.sync_email ?? 'your account'}.` },
        { label: 'Reading', copy: 'Foldera is reading recent history for the one thing already handled.' },
        { label: 'First value', copy: 'The first value appears when the first read is ready.' },
      ],
    };
  }

  return {
    headline: `${providerName} is connected and Foldera is ready to keep reading.`,
    detail: 'Foldera has already read recent context. Keep using the product and it will keep surfacing one finished move, not a task list.',
    missingScopes,
    missingScopesLabel: '',
    steps: [
      { label: 'Connected', copy: `${providerName} is linked to ${integration.sync_email ?? 'your account'}.` },
      { label: 'Handled', copy: 'Foldera already has the context it needs.' },
      { label: 'First value', copy: 'Your next finished move arrives when it is ready.' },
    ],
  };
}

function GoogleIcon() {
  return (
    <div className="w-9 h-9 bg-panel border border-border rounded-card flex items-center justify-center shrink-0">
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
    <div className="w-9 h-9 bg-panel border border-border rounded-card flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}




