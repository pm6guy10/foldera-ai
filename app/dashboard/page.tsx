'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Mail,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CalendarEventArtifact,
  ConvictionAction,
  DecisionFrameArtifact,
  DocumentArtifact,
  ResearchBriefArtifact,
  WaitRationaleArtifact,
} from '@/lib/briefing/types';

type EmailLikeArtifact = {
  type: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
};

type ArtifactView =
  | EmailLikeArtifact
  | DecisionFrameArtifact
  | WaitRationaleArtifact
  | DocumentArtifact
  | CalendarEventArtifact
  | ResearchBriefArtifact;

type ActionWithDomain = ConvictionAction & { domain?: string };

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [action, setAction] = useState<ActionWithDomain | null>(null);
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
            const message = (data as { error?: string }).error ?? 'Could not update that directive.';
            throw new Error(message);
          }

          if (data.status === 'executed' || data.status === 'skipped') {
            setDone(true);
            setFlash(
              deepAction === 'approve'
                ? 'Approved. Foldera executed that prepared move.'
                : 'Skipped. Foldera will use that feedback tomorrow.'
            );
            return;
          }

          throw new Error('Unexpected response from Foldera.');
        })
        .catch((err: unknown) => {
          setDone(true);
          setFlash(err instanceof Error ? err.message : 'Could not update that directive.');
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

  async function handleDecision(decision: 'approve' | 'skip') {
    if (!action) return;

    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `${decision} failed`);
      setDone(true);
      setFlash(
        decision === 'approve'
          ? 'Approved. Foldera executed that prepared move.'
          : 'Skipped. Foldera will use that feedback tomorrow.'
      );
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : `${decision} failed`);
    }
  }

  const artifact = (action?.artifact as ArtifactView | null | undefined) ?? null;

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#07080d]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div>
            <p className="text-lg font-black tracking-tight text-white">Foldera</p>
            <p className="text-xs text-zinc-500">One prepared move. One decision.</p>
          </div>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        {loading ? (
          <LoadingState />
        ) : done ? (
          <DoneState flash={flash} />
        ) : !action ? (
          <EmptyState flash={flash} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-1 shadow-2xl shadow-black/30">
              <div className="rounded-[calc(2rem-1px)] border border-white/8 bg-zinc-950/90 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      Today&apos;s prepared move
                    </p>
                    <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                      {action.directive}
                    </h1>
                  </div>
                  {action.domain && (
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.16em] text-zinc-400">
                      {action.domain}
                    </div>
                  )}
                </div>

                {action.reason && (
                  <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">
                    {action.reason}
                  </p>
                )}

                <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    Prepared artifact
                  </div>
                  <div className="mt-4">
                    <ArtifactPanel artifact={artifact} />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => handleDecision('approve')}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision('skip')}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <X className="h-4 w-4" />
                    Skip
                  </button>
                </div>
                <p className="mt-3 text-sm text-zinc-500">
                  Approve executes the prepared work now. Skip dismisses it and helps Foldera learn what should stay out of the morning slot.
                </p>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Why this surfaced
                </p>
                <div className="mt-4 space-y-3">
                  {action.evidence?.length ? (
                    action.evidence.slice(0, 4).map((item, index) => (
                      <div key={`${item.description}-${index}`} className="rounded-2xl border border-white/8 bg-zinc-950/60 p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{item.type}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{item.description}</p>
                        {item.date && <p className="mt-1 text-xs text-zinc-600">{formatDate(item.date)}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-zinc-500">
                      Foldera did not return supporting evidence for this directive.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Tomorrow
                </p>
                <div className="mt-4 rounded-2xl border border-white/8 bg-zinc-950/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white/6 p-2">
                      <Clock3 className="h-4 w-4 text-zinc-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Next read arrives at 7:00 AM Pacific</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-500">
                        Foldera will keep reading in the background. Your job is still just one yes-or-no decision.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href="/dashboard/settings"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
                >
                  Adjust connections or focus areas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function ArtifactPanel({ artifact }: { artifact: ArtifactView | null }) {
  if (!artifact) {
    return <p className="text-sm text-zinc-500">No artifact was attached to this directive.</p>;
  }

  if (artifact.type === 'email' || artifact.type === 'drafted_email') {
    const email = artifact as EmailLikeArtifact;
    const recipient = email.to || email.recipient || 'Recipient not provided';

    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <Mail className="h-3.5 w-3.5" />
          drafted email
        </div>
        <p className="mt-3 text-sm text-zinc-400">To: {recipient}</p>
        {email.subject && <p className="mt-1 text-sm font-medium text-white">Subject: {email.subject}</p>}
        {email.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{email.body}</p>}
      </div>
    );
  }

  if (artifact.type === 'decision_frame') {
    const decision = artifact as DecisionFrameArtifact;
    return (
      <div className="space-y-3">
        {decision.recommendation && (
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
            <span className="font-semibold">Recommendation:</span> {decision.recommendation}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {decision.options.map((option, index) => (
            <div key={`${option.option}-${index}`} className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
              <p className="text-sm font-semibold text-white">{option.option}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{option.rationale}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.type === 'wait_rationale') {
    const wait = artifact as WaitRationaleArtifact;
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
        <p className="text-sm leading-7 text-zinc-300">{wait.context}</p>
        {wait.evidence && <p className="mt-4 text-sm leading-7 text-zinc-400">{wait.evidence}</p>}
        {(wait.tripwires?.length || wait.check_date) && (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
            <span className="font-semibold">Resume when:</span>{' '}
            {wait.tripwires?.[0] ?? formatDate(wait.check_date ?? '')}
          </div>
        )}
      </div>
    );
  }

  if (artifact.type === 'document') {
    const document = artifact as DocumentArtifact;
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <FileText className="h-3.5 w-3.5" />
          drafted document
        </div>
        <p className="mt-3 text-sm font-semibold text-white">{document.title}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{document.content}</p>
      </div>
    );
  }

  if (artifact.type === 'calendar_event') {
    const event = artifact as CalendarEventArtifact;
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <CalendarDays className="h-3.5 w-3.5" />
          calendar event
        </div>
        <p className="mt-3 text-sm font-semibold text-white">{event.title}</p>
        <p className="mt-2 text-sm text-zinc-400">{formatDateTime(event.start)} → {formatDateTime(event.end)}</p>
        {event.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{event.description}</p>}
      </div>
    );
  }

  if (artifact.type === 'research_brief') {
    const brief = artifact as ResearchBriefArtifact;
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
        <p className="text-sm whitespace-pre-wrap leading-7 text-zinc-300">{brief.findings}</p>
        {brief.recommended_action && (
          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
            <span className="font-semibold">Recommended action:</span> {brief.recommended_action}
          </div>
        )}
      </div>
    );
  }

  return <p className="text-sm text-zinc-500">Unsupported artifact type.</p>;
}

function LoadingState() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="animate-pulse rounded-[2rem] border border-white/8 bg-white/[0.03] p-8">
        <div className="h-4 w-40 rounded bg-zinc-800" />
        <div className="mt-5 h-10 w-4/5 rounded bg-zinc-800" />
        <div className="mt-4 h-20 rounded bg-zinc-900" />
        <div className="mt-6 h-48 rounded-[1.5rem] bg-zinc-900" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="h-14 rounded-2xl bg-zinc-800" />
          <div className="h-14 rounded-2xl bg-zinc-800" />
        </div>
      </div>
      <div className="animate-pulse space-y-6">
        <div className="h-48 rounded-[2rem] bg-white/[0.03]" />
        <div className="h-44 rounded-[2rem] bg-white/[0.03]" />
      </div>
    </div>
  );
}

function DoneState({ flash }: { flash: string | null }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[2rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-1 text-center shadow-2xl shadow-black/30">
      <div className="rounded-[calc(2rem-1px)] border border-white/8 bg-zinc-950/90 px-6 py-12 sm:px-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
          <Check className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight text-white">You&apos;re done for today.</h1>
        <p className="mt-4 text-base leading-7 text-zinc-300">{flash ?? 'Foldera recorded that decision.'}</p>
        <p className="mt-3 text-sm text-zinc-500">The next read arrives at 7:00 AM Pacific.</p>
        <Link
          href="/dashboard/settings"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
        >
          Open settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ flash }: { flash: string | null }) {
  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/8 bg-white/[0.03] p-8 sm:p-10">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">No directive yet</p>
      <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
        Foldera is building your next morning read.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
        Once Foldera has enough signal, this dashboard turns into one simple decision: approve the prepared move or skip it.
      </p>
      {flash && <p className="mt-4 text-sm text-zinc-400">{flash}</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          'Connect email and calendar in Settings.',
          'Tell Foldera what you care about most.',
          'Come back at 7:00 AM Pacific for the first read.',
        ].map((item, index) => (
          <div key={item} className="rounded-2xl border border-white/8 bg-zinc-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">0{index + 1}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{item}</p>
          </div>
        ))}
      </div>
      <Link
        href="/dashboard/settings"
        className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
      >
        Open settings
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
