'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Settings, Sparkles, XCircle } from 'lucide-react';

interface ConvictionAction {
  id: string;
  directive: string;
  domain?: string | null;
  artifact?: any;
}

interface ArtifactWithDraftedEmail {
  type?: string;
  subject?: string;
  body?: string;
  to?: string;
  recipient?: string;
  options?: Array<{ option: string; rationale: string }>;
  context?: string;
  tripwires?: string[];
  check_date?: string;
}

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [action, setAction] = useState<ConvictionAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.push(`/login?callbackUrl=${encodeURIComponent(`/dashboard${search}`)}`);
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction === 'approve' || deepAction === 'skip') {
      fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: id, decision: deepAction }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = (data as { error?: string }).error ?? 'Could not update that action.';
            throw new Error(msg);
          }
          if (data.status === 'executed' || data.status === 'skipped') {
            setDone(true);
            setFlash(deepAction === 'approve' ? 'Done. Foldera executed that.' : 'Skipped. Foldera will adjust.');
          } else {
            throw new Error('Unexpected response from Foldera.');
          }
        })
        .catch((err: unknown) => {
          setDone(true);
          setFlash(err instanceof Error ? err.message : 'Could not update that action.');
        });
    }
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const hasDeepLink = params.get('action') && params.get('id');
      if (!hasDeepLink) {
        const checkRes = await fetch('/api/onboard/check');
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.hasOnboarded) {
            router.push('/onboard');
            return;
          }
        }
      }

      const res = await fetch('/api/conviction/latest');
      const data = await res.json().catch(() => ({}));
      setAction(data?.id ? data : null);
    } catch {
      setAction(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, load]);

  const handleApprove = async () => {
    if (!action) return;
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'approve' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Approve failed');
      setDone(true);
      setFlash('Done. Foldera executed that.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleSkip = async () => {
    if (!action) return;
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'skip' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Skip failed');
      setDone(true);
      setFlash('Skipped. Foldera will adjust.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Skip failed');
    }
  };

  const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const isEmail = artifact?.type === 'email' || artifact?.type === 'drafted_email';
  const isDecision = artifact?.type === 'decision_frame';
  const isWait = artifact?.type === 'wait_rationale';
  const recipient = artifact?.to || artifact?.recipient || '';

  return (
    <div className="min-h-screen bg-[#07070c] text-white relative overflow-hidden">
      <AmbientBackdrop />

      <header className="relative z-10 border-b border-white/5 bg-black/45 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto h-16 flex items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-black tracking-[0.16em] uppercase text-white">Foldera</Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/briefings" className="text-xs uppercase tracking-[0.18em] text-zinc-500 hover:text-white transition-colors hidden sm:block">
              Briefings
            </Link>
            <Link href="/dashboard/settings" className="w-10 h-10 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/20 transition-colors">
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        {flash && (
          <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-200">
            {flash}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="h-[28rem] rounded-[2rem] bg-white/[0.04] border border-white/10" />
            <div className="space-y-4">
              <div className="h-28 rounded-[2rem] bg-white/[0.04] border border-white/10" />
              <div className="h-40 rounded-[2rem] bg-white/[0.04] border border-white/10" />
            </div>
          </div>
        ) : done ? (
          <CenteredState
            icon={<CheckCircle2 className="w-8 h-8 text-emerald-300" />}
            title="That directive is handled."
            body="Foldera logged your decision and will use it to sharpen the next morning read."
            footer="Next read arrives at 7am Pacific."
          />
        ) : !action ? (
          <CenteredState
            icon={<Clock3 className="w-8 h-8 text-cyan-300" />}
            title="Your first read arrives tomorrow morning."
            body="Foldera is still learning your patterns and assembling the first directive."
            footer="Next read arrives at 7am Pacific."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] items-start">
            <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl shadow-[0_30px_120px_rgba(0,0,0,0.5)] overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_58%)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {action.domain && (
                      <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300 font-black">{action.domain}</p>
                    )}
                    <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight leading-[1.08] text-white">
                      {action.directive}
                    </h1>
                  </div>
                  <div className="w-12 h-12 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 flex items-center justify-center text-cyan-300 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-4 text-zinc-400 leading-relaxed">
                  Foldera prepared the artifact below. Approve executes it. Skip dismisses it and teaches the engine this was not the move.
                </p>
              </div>

              <div className="p-6 sm:p-8">
                {artifact ? (
                  <ArtifactCard artifact={artifact} isEmail={isEmail} isDecision={isDecision} isWait={isWait} recipient={recipient} />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-zinc-400">
                    No artifact was attached to this directive.
                  </div>
                )}

                <div className="mt-6 grid sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleApprove}
                    className="rounded-2xl bg-white text-black hover:bg-zinc-200 px-5 py-4 font-black uppercase tracking-[0.16em] text-xs transition-all inline-flex items-center justify-center gap-2"
                  >
                    Approve and run
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSkip}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 px-5 py-4 font-medium transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Skip and teach Foldera
                  </button>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <SidebarCard title="What Approve does" body="Executes the prepared action exactly as shown here." />
              <SidebarCard title="What Skip does" body="Dismisses this directive and helps Foldera rank future ones better." />
              <SidebarCard title="Timing" body="Next read arrives at 7am Pacific." />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function ArtifactCard({
  artifact,
  isEmail,
  isDecision,
  isWait,
  recipient,
}: {
  artifact: ArtifactWithDraftedEmail;
  isEmail: boolean;
  isDecision: boolean;
  isWait: boolean;
  recipient: string;
}) {
  if (isEmail) {
    return (
      <div className="rounded-[1.7rem] border border-white/10 bg-black/25 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">Prepared email</p>
          {recipient && <p className="mt-2 text-sm text-zinc-400">To: {recipient}</p>}
          {artifact.subject && <p className="mt-1 text-sm text-white font-semibold">Subject: {artifact.subject}</p>}
        </div>
        {artifact.body && (
          <div className="px-5 py-5 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {artifact.body}
          </div>
        )}
      </div>
    );
  }

  if (isDecision && artifact.options) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {artifact.options.slice(0, 2).map((opt, i) => (
          <div key={i} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
            <p className="text-white font-semibold">{opt.option}</p>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{opt.rationale}</p>
          </div>
        ))}
      </div>
    );
  }

  if (isWait) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
        {artifact.context && <p className="text-sm text-zinc-300 leading-relaxed">Why wait: {artifact.context}</p>}
        {(artifact.tripwires?.[0] || artifact.check_date) && (
          <p className="text-sm text-emerald-300 mt-3">
            Resume when: {artifact.tripwires?.[0] ?? artifact.check_date}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5 text-zinc-300">
      Artifact ready.
    </div>
  );
}

function SidebarCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-black">{title}</p>
      <p className="text-zinc-300 mt-3 leading-relaxed">{body}</p>
    </div>
  );
}

function CenteredState({
  icon,
  title,
  body,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  footer: string;
}) {
  return (
    <div className="max-w-2xl mx-auto rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-2xl shadow-[0_30px_120px_rgba(0,0,0,0.5)] overflow-hidden text-center">
      <div className="p-10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_58%)]">
        <div className="w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.05] flex items-center justify-center mx-auto">
          {icon}
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-zinc-400 leading-relaxed">{body}</p>
        <p className="mt-6 text-sm text-zinc-500">{footer}</p>
      </div>
    </div>
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
