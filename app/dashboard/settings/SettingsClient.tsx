'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Mail,
  Settings,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';

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
  'Job search',
  'Career growth',
  'Side project',
  'Business ops',
  'Health & family',
  'Financial',
  'Relationships',
  'Learning',
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
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch('/api/integrations/status'),
      fetch('/api/subscription/status'),
      fetch('/api/onboard/set-goals'),
    ])
      .then(async ([intRes, subRes, goalsRes]) => {
        if (intRes.ok) {
          const data = await intRes.json();
          setIntegrations(data.integrations || []);
          setSourceCounts(data.sourceCounts || {});
        }
        if (subRes.ok) {
          setSubscription(await subRes.json());
        }
        if (goalsRes.ok) {
          const goals = await goalsRes.json();
          setGoalBuckets(goals.buckets ?? []);
          setGoalFreeText(goals.freeText ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected') === 'true';
    const microsoftConnected = params.get('microsoft_connected') === 'true';
    if (!googleConnected && !microsoftConnected) return;

    window.history.replaceState({}, '', window.location.pathname);

    const provider = googleConnected ? 'Google' : 'Microsoft';
    const syncUrl = googleConnected ? '/api/google/sync-now' : '/api/microsoft/sync-now';
    setSyncStatus(`Syncing your ${provider} data…`);

    fetch(syncUrl, { method: 'POST' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const total = data.total ?? 0;
          setSyncStatus(`Synced ${total} signal${total === 1 ? '' : 's'} from ${provider}.`);
        } else {
          setSyncStatus(`Connection successful. ${provider} sync started.`);
        }
      })
      .catch(() => {
        setSyncStatus(`Connection successful. ${provider} sync started.`);
      })
      .finally(() => {
        setTimeout(() => setSyncStatus(null), 6000);
      });
  }, [status]);

  const google = integrations.find((item) => item.provider === 'google');
  const microsoft = integrations.find((item) => item.provider === 'azure_ad');

  async function handleSignOut() {
    try {
      await signOut({ redirect: false, callbackUrl: '/' });
    } catch {
      // ignore and hard redirect
    }
    window.location.href = '/';
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    setDeleteError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (res.ok) {
        await signOut({ callbackUrl: '/' });
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(typeof data.error === 'string' ? data.error : 'Could not delete account right now.');
      }
    } catch {
      setDeleteError('Could not delete account right now.');
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#07080d] text-white">
        <Header />
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
          <div className="animate-pulse space-y-6">
            <div className="h-40 rounded-[2rem] bg-white/[0.03]" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-56 rounded-[2rem] bg-white/[0.03]" />
              <div className="h-56 rounded-[2rem] bg-white/[0.03]" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-[#07080d] text-white">
        <Header />
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
          <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-8">
            <p className="text-sm text-zinc-400">Please sign in to manage your settings.</p>
          </div>
        </main>
      </div>
    );
  }

  const planLabel = subscription?.plan === 'pro' ? 'Professional' : 'Free';
  const planDetail =
    subscription?.status === 'active'
      ? 'Active'
      : subscription?.status === 'past_due'
        ? 'Payment past due'
        : subscription?.status ?? '';

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        {syncStatus && (
          <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
            {syncStatus}
          </div>
        )}

        <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Settings</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Keep the morning read pointed in the right direction.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
                Connections, focus areas, billing, and a manual test run all live here. The product should still feel simple even when the controls live underneath it.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-white/8 bg-zinc-950/70 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Account</p>
              <p className="mt-2 text-sm font-medium text-white">{session?.user?.email ?? 'Signed in'}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Clock3 className="h-3.5 w-3.5" />
                Next read arrives at 7:00 AM Pacific
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-xl font-semibold text-white">Connected accounts</h2>
                <p className="text-sm text-zinc-500">Foldera only works when it can read in the background.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <IntegrationCard
                label="Google"
                sublabel={google?.is_active ? google.sync_email || 'Connected' : 'Not connected'}
                connected={!!google?.is_active}
                onConnect={() => { window.location.href = '/api/google/connect'; }}
                onDisconnect={() => fetch('/api/google/disconnect', { method: 'POST' }).then(() => window.location.reload())}
                counts={[
                  { label: 'Gmail', count: sourceCounts.gmail ?? 0 },
                  { label: 'Calendar', count: sourceCounts.google_calendar ?? 0 },
                  { label: 'Drive', count: sourceCounts.google_drive ?? 0 },
                ]}
                icon={<GoogleIcon />}
              />

              <IntegrationCard
                label="Microsoft"
                sublabel={microsoft?.is_active ? microsoft.sync_email || 'Connected' : 'Not connected'}
                connected={!!microsoft?.is_active}
                onConnect={() => { window.location.href = '/api/microsoft/connect'; }}
                onDisconnect={() => fetch('/api/microsoft/disconnect', { method: 'POST' }).then(() => window.location.reload())}
                counts={[
                  { label: 'Mail', count: sourceCounts.outlook ?? 0 },
                  { label: 'Calendar', count: sourceCounts.outlook_calendar ?? 0 },
                  { label: 'OneDrive', count: sourceCounts.onedrive ?? 0 },
                ]}
                icon={<MicrosoftIcon />}
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-xl font-semibold text-white">Focus areas</h2>
                <p className="text-sm text-zinc-500">This tells Foldera what should count more when it chooses the morning slot.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-zinc-950/70 p-5">
              {goalBuckets.length === 0 && !goalFreeText ? (
                <p className="text-sm text-zinc-500">No focus areas set yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {ALL_BUCKETS.map((bucket) => {
                      const active = goalBuckets.includes(bucket);
                      return (
                        <span
                          key={bucket}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            active
                              ? 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                              : 'border border-white/8 bg-white/[0.03] text-zinc-600'
                          }`}
                        >
                          {bucket}
                        </span>
                      );
                    })}
                  </div>
                  {goalFreeText && <p className="mt-4 text-sm leading-7 text-zinc-300">{goalFreeText}</p>}
                </>
              )}

              <button
                onClick={() => router.push('/onboard?edit=true')}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
              >
                Edit focus areas
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-xl font-semibold text-white">Plan</h2>
                <p className="text-sm text-zinc-500">Keep pricing language simple and obvious.</p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-cyan-400/20 bg-cyan-400/10 p-5">
              <p className="text-sm font-semibold text-white">{planLabel}</p>
              {planDetail && <p className="mt-1 text-sm text-cyan-100/80">{planDetail}</p>}
              <p className="mt-4 text-4xl font-black tracking-tight text-white">$29<span className="text-base font-semibold text-zinc-400"> / month</span></p>
              {subscription?.plan === 'pro' && subscription?.status !== 'active' && (
                <button
                  onClick={async () => {
                    const res = await fetch('/api/stripe/checkout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({}),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (data.url) window.location.href = data.url;
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
                >
                  Upgrade now
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
            <h2 className="text-xl font-semibold text-white">Run a manual test</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-500">
              Sync your connected accounts, generate today&apos;s brief, and send it now. Use this when you want to verify the loop end to end.
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
                    setTimeout(() => {
                      window.location.href = '/dashboard';
                    }, 1500);
                  } else if (res.ok && data?.stages) {
                    const stages = data.stages as Record<string, { ok?: boolean }>;
                    const failures: string[] = [];
                    if (stages.sync_microsoft?.ok === false) failures.push('Microsoft sync failed');
                    if (stages.sync_google?.ok === false) failures.push('Google sync failed');
                    if (stages.daily_brief?.ok === false) failures.push('Brief generation failed');
                    setGenerateState(failures.length ? 'error' : 'success');
                    setGenerateMessage(failures.length ? `${failures.join('. ')}.` : 'Done.');
                  } else {
                    setGenerateState('error');
                    setGenerateMessage(data?.error || 'Something went wrong.');
                  }
                } catch {
                  setGenerateState('error');
                  setGenerateMessage('Network error — could not reach the server.');
                }
              }}
              className={`mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold transition ${
                generateState === 'loading'
                  ? 'cursor-wait bg-zinc-800 text-zinc-400'
                  : 'bg-white text-black hover:bg-zinc-200'
              }`}
            >
              {generateState === 'loading' ? 'Running sync + brief…' : 'Generate now'}
              {generateState !== 'loading' && <ArrowRight className="h-4 w-4" />}
            </button>
            {generateMessage && (
              <p className={`mt-3 text-sm ${generateState === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {generateMessage}
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-[2rem] border border-red-500/15 bg-red-500/[0.03] p-6">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 text-red-300" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-white">Account actions</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-400">
                Sign out normally, or permanently delete your account and stored data.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleSignOut}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                >
                  Sign out
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200 transition hover:border-red-500/40 hover:bg-red-500/15"
                >
                  {deleteConfirm ? 'Tap again to confirm deletion' : 'Delete account'}
                </button>
              </div>

              {deleteError && <p className="mt-3 text-sm text-red-300">{deleteError}</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07080d]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/dashboard" className="text-lg font-black tracking-tight text-white">
          Foldera
        </Link>
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
          <Settings className="h-4 w-4" />
          Settings
        </div>
      </div>
    </header>
  );
}

function IntegrationCard({
  label,
  sublabel,
  connected,
  onConnect,
  onDisconnect,
  counts,
  icon,
}: {
  label: string;
  sublabel: string;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  counts: Array<{ label: string; count: number }>;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-zinc-950/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className={`mt-1 text-sm ${connected ? 'text-emerald-300' : 'text-zinc-500'}`}>{sublabel}</p>
          </div>
        </div>
        {connected ? (
          <button
            onClick={onDisconnect}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Connect
          </button>
        )}
      </div>

      {connected && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {counts.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {item.count} signal{item.count === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900">
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
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900">
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    </div>
  );
}
