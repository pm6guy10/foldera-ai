'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { MorningAnchorCard, type RightNowCardActionId } from '@/components/dashboard/MorningAnchorCard';
import { ProductShell } from '@/components/dashboard/ProductShell';
import type { RightNowCard } from '@/lib/workday-presence/model';
import { AuthTrustPills } from '@/components/auth/AuthTrustPills';
import { OAuthConnectButton } from '@/components/auth/OAuthConnectButton';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';

type ConnectedSourceState = 'loading' | 'connected' | 'missing' | 'error';

type PanelKey = 'today' | 'history' | 'sources' | 'account';

const PANEL_META: Record<PanelKey, { title: string; subtitle: string }> = {
  today: {
    title: 'Today',
    subtitle: 'Your re-entry point. One move, the context behind it, and nothing else to babysit.',
  },
  history: {
    title: 'Recent Work',
    subtitle: 'Finished, approved, and skipped items from past cycles.',
  },
  sources: {
    title: 'Sources',
    subtitle: 'Connected accounts Foldera reads for context. Nothing sends without your approval.',
  },
  account: {
    title: 'Account',
    subtitle: 'Your sign-in and account controls.',
  },
};

function resolvePanel(value: string | null): PanelKey {
  if (value === 'history' || value === 'sources' || value === 'account') return value;
  return 'today';
}

function hasActiveSource(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const integrations = (payload as { integrations?: unknown }).integrations;
  if (!Array.isArray(integrations)) return false;
  return integrations.some((integration) => {
    if (!integration || typeof integration !== 'object') return false;
    const row = integration as { provider?: unknown; is_active?: unknown };
    return (
      row.is_active === true &&
      (row.provider === 'google' || row.provider === 'azure_ad' || row.provider === 'microsoft')
    );
  });
}

function readCard(payload: unknown): RightNowCard | null {
  if (!payload || typeof payload !== 'object') return null;
  const card = (payload as { card?: unknown }).card;
  if (!card || typeof card !== 'object') return null;
  return card as RightNowCard;
}

function SignOutAction() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
      className="inline-flex min-h-[40px] items-center gap-2 foldera-button-radius border border-border px-3 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

function TodayPanel() {
  const { status } = useSession();
  const [card, setCard] = useState<RightNowCard | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<ConnectedSourceState>('loading');

  const loadCard = useCallback(async () => {
    try {
      const response = await fetch('/api/workday-presence');
      const payload = await response.json().catch(() => null);
      setCard(response.ok ? readCard(payload) : null);
    } catch {
      setCard(null);
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      if (status === 'unauthenticated') setCardLoading(false);
      return;
    }
    void loadCard();
  }, [status, loadCard]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/integrations/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('integration status unavailable');
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setSourceState(hasActiveSource(payload) ? 'connected' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setSourceState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const saveAnchor = useCallback(
    async (input: {
      current_focus: string;
      next_move: string;
      why_it_matters: string;
      blocker: string;
      do_not_touch: string;
      waiting_on: string;
      last_completed_step: string;
    }) => {
      setSaveError(null);
      const response = await fetch('/api/workday-presence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null);
      const nextCard = response.ok ? readCard(payload) : null;
      if (!nextCard) {
        setSaveError('Could not save your anchor. Try again.');
        return;
      }
      setCard(nextCard);
    },
    [],
  );

  const respond = useCallback(
    async (actionId: RightNowCardActionId) => {
      setActionPending(true);
      setSaveError(null);
      try {
        const response = await fetch('/api/workday-presence/message-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: actionId }),
        });
        if (!response.ok) {
          setSaveError('Could not record your response. Try again.');
          return;
        }
        await loadCard();
      } finally {
        setActionPending(false);
      }
    },
    [loadCard],
  );

  const autoDetect = useCallback(async () => {
    setSaveError(null);
    try {
      const response = await fetch('/api/workday-presence/seed-from-scorer', {
        method: 'POST',
      });
      if (!response.ok) {
        setSaveError('Could not detect your next move. Try again.');
        return;
      }
      await loadCard();
    } catch {
      setSaveError('Could not detect your next move. Try again.');
    }
  }, [loadCard]);

  return (
    <div>
      {sourceState === 'missing' ? (
        <div
          data-testid="dashboard-connect-strip"
          className="mb-6 rounded-[24px] border border-cyan-400/20 bg-cyan-950/20 backdrop-blur-md px-6 py-5 shadow-[0_0_30px_rgba(34,211,238,0.05)]"
        >
          <p className="text-sm font-semibold text-cyan-50">Connect one source</p>
          <p className="mt-1 text-sm leading-6 text-cyan-100/70">
            Foldera reads connected context to find your re-entry point. Nothing sends without
            your approval.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <OAuthConnectButton
              label="Connect Google"
              provider="google"
              href="/api/google/connect"
            />
            <OAuthConnectButton
              label="Connect Microsoft"
              provider="azure-ad"
              href="/api/microsoft/connect"
            />
          </div>
        </div>
      ) : null}

      {cardLoading || status === 'loading' ? (
        <div className="flex justify-center py-24" data-testid="dashboard-card-loading">
          <div className="flex flex-col gap-4 w-full max-w-2xl">
            <div className="h-[200px] w-full animate-pulse-fast rounded-[28px] bg-white/[0.03] border border-white/[0.05]" />
          </div>
        </div>
      ) : (
        <MorningAnchorCard
          card={
            card ?? {
              mode: 'setup',
              prompt: 'What are you trying to move forward today?',
              verdict_line: null,
            }
          }
          onSave={saveAnchor}
          onAction={respond}
          onAutoDetect={sourceState === 'connected' ? autoDetect : undefined}
          actionPending={actionPending}
        />
      )}

      {saveError ? (
        <p role="alert" className="mt-4 text-center text-sm text-amber-200">
          {saveError}
        </p>
      ) : null}

      <div data-testid="trust-rail" className="mx-auto mt-8 max-w-[760px]">
        <AuthTrustPills />
        <div className="mt-4 text-center">
          <Link
            href="/dashboard?panel=sources"
            className="inline-block text-xs text-cyan-400/70 underline-offset-2 hover:text-cyan-400 hover:underline"
          >
            Manage sources →
          </Link>
        </div>
      </div>
    </div>
  );
}

type HistoryItem = {
  id: string;
  status: string;
  action_type: string;
  confidence: number | null;
  generated_at: string | null;
  directive_preview: string;
  has_artifact?: boolean;
  artifact_preview?: string;
};

function statusClass(status: string) {
  switch (status) {
    case 'pending_approval':
      return 'border-accent-dim bg-accent-dim/20 text-accent-hover';
    case 'executed':
    case 'approved':
      return 'border-success bg-success/20 text-text-primary';
    case 'failed':
      return 'border-border-strong bg-panel-raised text-text-secondary';
    default:
      return 'border-border bg-panel-raised text-text-secondary';
  }
}

function HistoryPanel() {
  const { status } = useSession();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetch('/api/conviction/history?limit=40')
      .then(async (response) => {
        if (!response.ok) {
          setError(true);
          setItems([]);
          return;
        }
        const data = (await response.json()) as { items?: HistoryItem[] };
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        setError(true);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
        <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Past directives</h2>

      {error && (
        <div className="rounded-card border border-border-strong bg-panel-raised px-4 py-3 text-sm text-text-secondary">
          Could not load history. Try again.
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-card border border-border-subtle bg-panel p-8 sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">No recent work yet</p>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-text-primary">You&apos;re clear for now.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Foldera will add completed work here after each cycle. Open Today for the active read, or review connected sources.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.12em] text-bg transition-colors hover:bg-accent-hover"
            >
              Open today
            </Link>
            <Link
              href="/dashboard?panel=sources"
              className="inline-flex min-h-[44px] items-center justify-center foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
            >
              Review sources
            </Link>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-panel p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-badge border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(row.status)}`}>
                  {row.status.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-text-muted">
                  {row.action_type.replace(/_/g, ' ')}
                </span>
                {typeof row.confidence === 'number' && (
                  <span className="text-xs tabular-nums text-text-secondary">{row.confidence}%</span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-primary">{row.directive_preview || '—'}</p>
              {row.has_artifact ? (
                <div className="mt-3 rounded-card border border-border-subtle bg-panel-raised px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">Artifact captured</p>
                  <p className="mt-2 text-xs leading-relaxed text-text-secondary">{row.artifact_preview || '—'}</p>
                </div>
              ) : null}
              {row.generated_at && (
                <p className="mt-3 text-xs text-text-muted">
                  {new Date(row.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type IntegrationStatus = {
  provider: string;
  is_active: boolean;
  sync_email?: string | null;
  last_synced_at?: string | null;
};

type GraphStats = {
  lastSignalAt: string | null;
  lastSignalSource: string | null;
};

function SourcesPanel() {
  const { status } = useSession();
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    Promise.all([fetch('/api/integrations/status'), fetch('/api/graph/stats')])
      .then(async ([integrationsResponse, statsResponse]) => {
        const nextIntegrations = integrationsResponse.ok ? await integrationsResponse.json() : null;
        const nextStats = statsResponse.ok ? await statsResponse.json() : null;
        setIntegrations(
          Array.isArray(nextIntegrations?.integrations) ? nextIntegrations.integrations : [],
        );
        setStats(
          nextStats && typeof nextStats === 'object'
            ? {
                lastSignalAt: typeof nextStats.lastSignalAt === 'string' ? nextStats.lastSignalAt : null,
                lastSignalSource:
                  typeof nextStats.lastSignalSource === 'string' ? nextStats.lastSignalSource : null,
              }
            : null,
        );
      })
      .catch(() => {
        setIntegrations([]);
        setStats(null);
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
        <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
      </div>
    );
  }

  const activeIntegrations = integrations.filter((integration) => integration.is_active);
  const latestSignalLabel = stats?.lastSignalAt
    ? `${providerDisplayName(stats.lastSignalSource)} · ${formatRelativeTime(stats.lastSignalAt)}`
    : 'No signal yet';

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-border-subtle bg-panel p-6">
        <div className="grid gap-4 border-b border-border-subtle pb-4 md:grid-cols-2">
          <article>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Connected sources</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">{activeIntegrations.length}</p>
          </article>
          <article>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Latest source signal</p>
            <p className="mt-2 text-sm leading-relaxed text-text-primary">{latestSignalLabel}</p>
          </article>
        </div>

        {activeIntegrations.length === 0 ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-text-secondary">
              No active sources are connected yet. Connect Google or Microsoft so Foldera can read context for your Right Now state.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <OAuthConnectButton label="Connect Google" provider="google" href="/api/google/connect" />
              <OAuthConnectButton label="Connect Microsoft" provider="azure-ad" href="/api/microsoft/connect" />
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {activeIntegrations.map((integration) => (
              <li key={integration.provider} className="rounded-card border border-border bg-panel-raised p-4">
                <p className="text-sm font-semibold text-text-primary">
                  {providerDisplayName(integration.provider)}
                </p>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {integration.sync_email || 'Connected'}
                  {integration.last_synced_at ? ` · ${formatRelativeTime(integration.last_synced_at)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex min-h-[44px] items-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
        >
          Manage connections
        </Link>
      </div>
    </div>
  );
}

function AccountPanel() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-border-subtle bg-panel p-6">
        {session?.user?.email ? (
          <div className="rounded-card bg-panel-raised border border-border-subtle px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-text-muted mb-1">Signed in as</p>
            <p className="break-all text-sm font-medium text-text-primary">{session.user.email}</p>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Please sign in to view account details.</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/settings"
            className="inline-flex min-h-[44px] items-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
          >
            Open full settings
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
            className="inline-flex min-h-[44px] items-center gap-2 foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const panel = resolvePanel(searchParams.get('panel'));
  const meta = PANEL_META[panel];

  return (
    <ProductShell
      title={meta.title}
      subtitle={meta.subtitle}
      headerActions={<SignOutAction />}
    >
      {panel === 'today' && <TodayPanel />}
      {panel === 'history' && <HistoryPanel />}
      {panel === 'sources' && <SourcesPanel />}
      {panel === 'account' && <AccountPanel />}
    </ProductShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <ProductShell title="Today" subtitle={PANEL_META.today.subtitle}>
          <div className="flex justify-center py-24">
            <div className="h-[200px] w-full max-w-2xl animate-pulse-fast rounded-[28px] border border-white/[0.05] bg-white/[0.03]" />
          </div>
        </ProductShell>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
