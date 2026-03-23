'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Settings, Sparkles } from 'lucide-react';

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

  useEffect(() => {
    if (status === 'loading') return;
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

  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected') === 'true';
    const microsoftConnected = params.get('microsoft_connected') === 'true';
    if (!googleConnected && !microsoftConnected) return;

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
        setTimeout(() => setSyncStatus(null), 6000);
      });
  }, [status]);

  const google = integrations.find(i => i.provider === 'google');
  const microsoft = integrations.find(i => i.provider === 'azure_ad');

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/' });
    } catch {
      // ignore
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
        <main className="pt-24 pb-10 px-4 max-w-5xl mx-auto">
          <div className="animate-pulse grid gap-4 md:grid-cols-2">
            <div className="h-40 bg-zinc-900/80 rounded-[2rem]" />
            <div className="h-40 bg-zinc-900/80 rounded-[2rem]" />
            <div className="h-48 bg-zinc-900/80 rounded-[2rem] md:col-span-2" />
          </div>
        </main>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="pt-24 pb-10 px-4 max-w-5xl mx-auto">
          <p className="text-zinc-400 text-sm mt-8">Please sign in to view settings.</p>
        </main>
      </div>
    );
  }

  const planLabel = subscription?.plan === 'pro' ? 'Pro' : 'Free';
  const planDetail = subscription?.status === 'active' ? 'Active' : subscription?.status === 'past_due' ? 'Payment past due' : '';

  return (
    <div className="min-h-screen bg-[#07070c] text-white relative overflow-hidden">
      <AmbientBackdrop />
      <Header />
      <main className="relative z-10 pt-24 pb-10 px-4 sm:px-6 max-w-5xl mx-auto">
        {syncStatus && (
          <div className="mb-6 px-4 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-sm text-cyan-300">
            {syncStatus}
          </div>
        )}

        <div className="mb-8 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 text-[11px] font-black uppercase tracking-[0.18em] mb-4">
            System controls
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">Settings</h1>
          <p className="mt-3 text-zinc-400 leading-relaxed">
            Manage connections, check the loop, update what Foldera should care about, and control your account.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Connected accounts" subtitle="Link the sources Foldera reads overnight." className="md:col-span-2">
            <div className="grid gap-4 md:grid-cols-2">
              <IntegrationCard
                name="Google"
                email={google?.is_active ? (google.sync_email || 'Connected') : 'Not connected'}
                active={!!google?.is_active}
                icon={<GoogleIcon />}
                onPrimary={() => {
                  if (google?.is_active) {
                    fetch('/api/google/disconnect', { method: 'POST' }).then(() => window.location.reload());
                  } else {
                    window.location.href = '/api/google/connect';
                  }
                }}
                primaryLabel={google?.is_active ? 'Disconnect' : 'Connect'}
                sourceLines={[
                  ['Gmail', sourceCounts['gmail'] ?? 0],
                  ['Calendar', sourceCounts['google_calendar'] ?? 0],
                  ['Drive', sourceCounts['google_drive'] ?? 0],
                ]}
              />

              <IntegrationCard
                name="Microsoft"
                email={microsoft?.is_active ? (microsoft.sync_email || 'Connected') : 'Not connected'}
                active={!!microsoft?.is_active}
                icon={<MicrosoftIcon />}
                onPrimary={() => {
                  if (microsoft?.is_active) {
                    fetch('/api/microsoft/disconnect', { method: 'POST' }).then(() => window.location.reload());
                  } else {
                    window.location.href = '/api/microsoft/connect';
                  }
                }}
                primaryLabel={microsoft?.is_active ? 'Disconnect' : 'Connect'}
                sourceLines={[
                  ['Mail', sourceCounts['outlook'] ?? 0],
                  ['Calendar', sourceCounts['outlook_calendar'] ?? 0],
                  ['OneDrive', sourceCounts['onedrive'] ?? 0],
                ]}
              />
            </div>
          </Panel>

          <Panel title="Focus areas" subtitle="These bias how Foldera ranks the morning directive.">
            {goalBuckets.length === 0 && !goalFreeText ? (
              <p className="text-sm text-zinc-500">No focus areas set yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {ALL_BUCKETS.map((label) => {
                    const active = goalBuckets.includes(label);
                    return (
                      <span
                        key={label}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                            : 'bg-white/[0.03] border-white/8 text-zinc-600'
                        }`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
                {goalFreeText && <p className="mt-4 text-sm text-zinc-300 leading-relaxed">{goalFreeText}</p>}
              </>
            )}
            <button
              onClick={() => router.push('/onboard?edit=true')}
              className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-white transition-colors"
            >
              Edit focus areas
              <Sparkles className="w-4 h-4" />
            </button>
          </Panel>

          <Panel title="Subscription" subtitle="One plan. One morning loop.">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-semibold">{planLabel}</p>
                <p className="text-sm text-zinc-500 mt-1">{planDetail || '$29/mo after trial'}</p>
              </div>
              {subscription?.plan === 'pro' && subscription?.status !== 'active' ? (
                <button
                  onClick={async () => {
                    const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                    const d = await res.json().catch(() => ({}));
                    if (d.url) window.location.href = d.url;
                  }}
                  className="rounded-xl bg-white text-black hover:bg-zinc-200 px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Upgrade
                </button>
              ) : (
                <div className="text-right">
                  <p className="text-2xl font-black tracking-tight text-white">$29</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">per month</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Daily brief" subtitle="Run the sync and generate loop manually.">
            <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
              Use this when you want to force a fresh pass instead of waiting for the next scheduled morning read.
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
              className={`w-full rounded-2xl py-3.5 text-sm font-semibold transition-colors ${
                generateState === 'loading'
                  ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {generateState === 'loading' ? 'Running sync + generate…' : 'Generate now'}
            </button>
            {generateMessage && (
              <p className={`mt-3 text-sm ${generateState === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>
                {generateMessage}
              </p>
            )}
          </Panel>

          <Panel title="Account" subtitle="Your session and deletion controls.">
            {session?.user?.email && <p className="text-sm text-zinc-400 mb-4">{session.user.email}</p>}
            <div className="grid gap-3">
              <button
                onClick={handleSignOut}
                className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-300 rounded-2xl py-3 text-sm font-medium transition-colors"
              >
                Sign out
              </button>
              <button
                onClick={handleDeleteAccount}
                className="w-full border border-red-900/70 hover:border-red-700 text-red-400 hover:text-red-300 rounded-2xl py-3 text-sm font-medium transition-colors"
              >
                {deleteConfirm ? 'Tap again to confirm deletion' : 'Delete account'}
              </button>
            </div>
            {deleteError && <p className="mt-3 text-sm text-red-400">{deleteError}</p>}
          </Panel>
        </div>
      </main>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  className = '',
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${className}`}>
      <div className="px-6 py-5 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_58%)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">{title}</p>
        <p className="text-sm text-zinc-400 mt-2 max-w-xl">{subtitle}</p>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function IntegrationCard({
  name,
  email,
  active,
  icon,
  onPrimary,
  primaryLabel,
  sourceLines,
}: {
  name: string;
  email: string;
  active: boolean;
  icon: React.ReactNode;
  onPrimary: () => void;
  primaryLabel: string;
  sourceLines: Array<[string, number]>;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-black/25 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {icon}
          <div>
            <p className="text-white font-semibold">{name}</p>
            <p className={`text-sm mt-1 ${active ? 'text-emerald-300' : 'text-zinc-500'}`}>{email}</p>
          </div>
        </div>
        <button
          onClick={onPrimary}
          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
            active
              ? 'text-zinc-400 hover:text-white bg-white/[0.04] border border-white/10'
              : 'bg-white text-black hover:bg-zinc-200 font-medium'
          }`}
        >
          {primaryLabel}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {sourceLines.map(([label, count]) => (
          <SourceLine key={label} label={label} count={count} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-10 border-b border-white/5 bg-black/45 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto h-16 flex items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="text-lg font-black tracking-[0.16em] uppercase text-white">Foldera</Link>
        <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-zinc-300">
          <Settings className="w-4 h-4" />
        </div>
      </div>
    </header>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[26rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}

function GoogleIcon() {
  return (
    <div className="w-11 h-11 bg-black/30 border border-white/10 rounded-2xl flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </div>
  );
}

function SourceLine({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs rounded-xl bg-white/[0.03] border border-white/8 px-3 py-2">
      <span className="text-zinc-500">{label}</span>
      <span className={count > 0 ? 'text-zinc-300' : 'text-zinc-600'}>
        {count} signal{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <div className="w-11 h-11 bg-black/30 border border-white/10 rounded-2xl flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}
