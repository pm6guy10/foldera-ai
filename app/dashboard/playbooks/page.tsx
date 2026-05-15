'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Repeat2,
  Route,
  ShieldCheck,
} from 'lucide-react';

import { ProductShell } from '@/components/dashboard/ProductShell';
import type { OutcomeAutopsyArtifact } from '@/lib/outcome-autopsy/outcome-autopsy';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; artifact: OutcomeAutopsyArtifact }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

const QUERY = 'CWU Access Specialist';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function classLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function AutopsyList({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-cyan-200/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-cyan-200/14 bg-cyan-300/[0.07] text-cyan-100">
          {icon}
        </span>
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">{title}</h2>
      </div>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-[#B8C4D2]">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AutopsyView({ artifact }: { artifact: OutcomeAutopsyArtifact }) {
  const positiveSignals = artifact.strongest_positive_signals;
  const decisiveActions = artifact.decisive_actions;
  const timeline = artifact.timeline;
  const genericEvents = artifact.generic_events;
  const topTimeline = useMemo(() => timeline.slice(0, 14), [timeline]);
  const outcomeDetails = artifact.outcome_details ?? [];
  const highSignalArtifacts = artifact.high_signal_artifacts ?? [];
  const evidenceVsInference = artifact.evidence_vs_inference;
  const futureRolesToPrioritize = artifact.future_roles_to_prioritize ?? [];
  const futureRolesToSkip = artifact.future_roles_to_skip ?? [];

  return (
    <div className="space-y-5" data-testid="outcome-autopsy-view">
      <section className="grid gap-4 rounded-[24px] border border-cyan-200/10 bg-[#050d16]/92 p-5 shadow-[0_22px_80px_rgba(0,0,0,0.28)] lg:grid-cols-[1.1fr_0.9fr] lg:p-6">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">
            Outcome autopsy
          </p>
          <h1 className="mt-3 text-[clamp(30px,4vw,48px)] font-semibold leading-tight tracking-normal text-white">
            {artifact.final_outcome}
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A2B6]">
                Goal
              </p>
              <p className="mt-2 text-sm leading-6 text-[#D8E1EA]">{artifact.goal.text}</p>
            </div>
            {outcomeDetails.slice(0, 4).map((detail) => (
              <div key={detail.label} className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#91A2B6]">
                  {detail.label}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">{detail.value}</p>
              </div>
            ))}
            <div className="rounded-[18px] border border-amber-200/14 bg-amber-200/[0.05] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/80">
                Causality
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{artifact.causality.label}</p>
              <p className="mt-2 text-sm leading-6 text-[#C9D2DE]">{artifact.causality.explanation}</p>
            </div>
          </div>
        </div>

        <section className="rounded-[20px] border border-emerald-200/12 bg-emerald-300/[0.045] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-200" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
              Reusable playbook
            </h2>
          </div>
          <p className="mt-3 text-lg font-semibold text-white">{artifact.reusable_playbook.title}</p>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-[#B8C4D2]">
            {artifact.reusable_playbook.steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-300/12 text-xs font-black text-emerald-100">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </section>

      {artifact.gold_standard_seed ? (
        <section className="rounded-[20px] border border-amber-200/12 bg-amber-200/[0.045] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-100" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
              Gold standard seed
            </h2>
          </div>
          <p className="mt-3 text-base font-semibold text-white">{artifact.gold_standard_seed.label}</p>
          <p className="mt-2 text-sm leading-6 text-[#C9D2DE]">{artifact.gold_standard_seed.privacy_policy}</p>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[24px] border border-cyan-200/10 bg-[#07111c]/90 p-5 lg:p-6">
          <div className="flex items-center gap-3">
            <Route className="h-5 w-5 text-cyan-200" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
              Timeline
            </h2>
          </div>
          <div className="mt-5 space-y-3">
            {topTimeline.map((item) => (
              <article
                key={`${item.kind}-${item.id}`}
                className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100">
                    {item.kind}
                  </span>
                  <span className="text-xs font-semibold text-[#91A2B6]">{formatDate(item.occurred_at)}</span>
                  {item.classifications.map((classification) => (
                    <span
                      key={classification}
                      className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#C9D2DE]"
                    >
                      {classLabel(classification)}
                    </span>
                  ))}
                </div>
                <h3 className="mt-3 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#AEBBCD]">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-[24px] border border-cyan-200/10 bg-[#07111c]/90 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" aria-hidden />
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
                Strongest signals
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {positiveSignals.map((signal) => (
                <article key={signal.id} className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-4">
                  <p className="text-sm font-semibold text-white">{signal.label}</p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-100">
                    {classLabel(signal.classification)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#AEBBCD]">{signal.why_strong}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-amber-200/12 bg-[#07111c]/90 p-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-200" aria-hidden />
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
                Strongest risks
              </h2>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#B8C4D2]">
              {artifact.strongest_risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      {highSignalArtifacts.length > 0 ? (
        <section className="rounded-[24px] border border-cyan-200/10 bg-[#07111c]/90 p-5 lg:p-6">
          <div className="flex items-center gap-3">
            <ListChecks className="h-5 w-5 text-cyan-200" aria-hidden />
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
              High-signal artifacts
            </h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highSignalArtifacts.map((item) => (
              <article key={item.id} className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">
                    {item.strength.replace(/_/g, ' ')}
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#C9D2DE]">
                    {item.sensitivity.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-white">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#AEBBCD]">{item.why_it_mattered}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {evidenceVsInference ? (
        <section className="grid gap-5 lg:grid-cols-3">
          <AutopsyList title="Evidence" items={evidenceVsInference.proven} icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} />
          <AutopsyList title="Inference" items={evidenceVsInference.inferred} icon={<Route className="h-5 w-5" aria-hidden />} />
          <AutopsyList title="Not proof" items={evidenceVsInference.not_used_as_proof} icon={<AlertTriangle className="h-5 w-5" aria-hidden />} />
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-3">
        <AutopsyList
          title="What worked"
          items={artifact.what_worked}
          icon={<ListChecks className="h-5 w-5" aria-hidden />}
        />
        <AutopsyList
          title="Repeat"
          items={artifact.what_to_repeat}
          icon={<Repeat2 className="h-5 w-5" aria-hidden />}
        />
        <AutopsyList
          title="Avoid"
          items={artifact.what_to_avoid_next_time}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
        />
      </section>

      {(futureRolesToPrioritize.length > 0 || futureRolesToSkip.length > 0) ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <AutopsyList
            title="Prioritize next"
            items={futureRolesToPrioritize}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          />
          <AutopsyList
            title="Skip next"
            items={futureRolesToSkip}
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          />
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-cyan-200/10 bg-white/[0.035] p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
            Decisive actions
          </h2>
          <div className="mt-4 space-y-3">
            {decisiveActions.map((action) => (
              <article key={action.id} className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-4">
                <p className="text-sm font-semibold text-white">{action.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#AEBBCD]">{action.why_decisive}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
            Generic events kept out
          </h2>
          <div className="mt-4 space-y-3">
            {genericEvents.length > 0 ? (
              genericEvents.map((event) => (
                <article key={event.id} className="rounded-[16px] border border-white/[0.08] bg-black/10 p-4">
                  <p className="text-sm font-semibold text-white">{event.label}</p>
                  <p className="mt-2 text-sm leading-6 text-[#AEBBCD]">{event.why_strong}</p>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-[#AEBBCD]">
                No generic background events were needed for this autopsy.
              </p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

export default function PlaybooksPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/outcome-autopsy/latest?q=${encodeURIComponent(QUERY)}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && payload?.artifact) {
          setState({ status: 'ready', artifact: payload.artifact as OutcomeAutopsyArtifact });
        } else if (response.status === 404) {
          setState({
            status: 'empty',
            message: payload?.message || 'No completed outcome with enough stored evidence was found.',
          });
        } else {
          setState({ status: 'error', message: payload?.error || 'Outcome autopsy is unavailable.' });
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Outcome autopsy is unavailable.' });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProductShell
      title="Playbooks"
      subtitle="Foldera reverse-engineers completed outcome paths into repeatable moves."
    >
      {state.status === 'loading' ? (
        <section className="rounded-[24px] border border-cyan-200/10 bg-[#07111c]/90 p-6 text-sm text-[#AEBBCD]">
          Building the latest outcome autopsy...
        </section>
      ) : null}

      {state.status === 'ready' ? <AutopsyView artifact={state.artifact} /> : null}

      {state.status === 'empty' || state.status === 'error' ? (
        <section className="rounded-[24px] border border-amber-200/12 bg-[#07111c]/90 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/80">
            Autopsy unavailable
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">{state.message}</h2>
        </section>
      ) : null}
    </ProductShell>
  );
}
