'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { AgentSystemPanel } from '@/components/dashboard/AgentSystemPanel';

interface WinnerTruthReport {
  current_winner: {
    verdict: 'selected' | 'no_safe_artifact_today';
    title: string | null;
    tier: string | null;
    artifact_family: string | null;
    note: string | null;
  };
  sync_health: {
    providers: Array<{
      provider: string;
      stale: boolean;
      age_hours: number | null;
    }>;
    graph: {
      graph_stale: boolean;
      stale_entity_count: number;
    };
    decrypt_fallback_count: number;
  };
  top_viable_candidates: Array<{
    candidate_id: string;
    title: string;
    tier: string;
    artifact_family: string;
    missing_blockers?: string[];
  }>;
  blocked_candidates: Array<{
    candidate_id: string;
    title: string;
    blockers: string[];
  }>;
  graph_drift: Array<{
    name: string;
    stored: { signal_count_90d: number };
    actual: { signal_count_90d: number };
  }>;
  polluted_entities: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  three_day_consistency: {
    passes: boolean;
    days: Array<{
      day: string;
      classification: 'useful_artifact' | 'no_safe_artifact' | 'garbage_regression';
      summary: string;
    }>;
  };
  action_needed: string[];
  future_findings: Array<{
    classification: 'current_blocker' | 'adjacent_risk' | 'future_backlog';
    finding: string;
    evidence: string;
    smallest_next_move: string;
  }>;
}

export default function SystemClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [aiRunState, setAiRunState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiRunMessage, setAiRunMessage] = useState<string | null>(null);
  const [agentsEnabled, setAgentsEnabled] = useState<boolean | null>(null);
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [truthState, setTruthState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [truthMessage, setTruthMessage] = useState<string | null>(null);
  const [winnerTruth, setWinnerTruth] = useState<WinnerTruthReport | null>(null);
  const lastPipelineRunRef = useRef<number>(0);

  useEffect(() => setMounted(true), []);

  const isOwner =
    mounted && status === 'authenticated' && session?.user?.id === OWNER_USER_ID;

  useEffect(() => {
    if (!mounted || status === 'loading') return;
    if (status !== 'authenticated' || session?.user?.id !== OWNER_USER_ID) {
      router.replace('/dashboard');
    }
  }, [mounted, router, session?.user?.id, status]);

  useEffect(() => {
    if (!isOwner) return;
    void fetch('/api/settings/agents')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload && typeof payload.enabled === 'boolean') setAgentsEnabled(payload.enabled);
        else setAgentsEnabled(true);
      })
      .catch(() => setAgentsEnabled(true));
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    void (async () => {
      setTruthState('loading');
      setTruthMessage(null);
      try {
        const response = await fetch('/api/system/winner-truth');
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
          setTruthState('error');
          setTruthMessage(payload?.error || 'Could not load winner truth.');
          return;
        }
        setWinnerTruth(payload as WinnerTruthReport);
        setTruthState('success');
      } catch {
        setTruthState('error');
        setTruthMessage('Could not load winner truth.');
      }
    })();
  }, [isOwner]);

  if (!mounted || status === 'loading' || !isOwner) {
    return (
      <ProductShell title="System tools" subtitle="Owner-only controls for pipeline and agents.">
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
          <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
        </div>
      </ProductShell>
    );
  }

  return (
    <ProductShell
      title="System tools"
      subtitle="Owner-only controls for pipeline execution and agent staging."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Winner truth</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              Plain-language proof of what Foldera knows, what is stale, and whether today&apos;s winner is actually useful.
            </p>
          </div>
          <button
            type="button"
            disabled={truthState === 'loading'}
            onClick={async () => {
              setTruthState('loading');
              setTruthMessage(null);
              try {
                const response = await fetch('/api/system/winner-truth');
                const payload = await response.json().catch(() => null);
                if (!response.ok || !payload) {
                  setTruthState('error');
                  setTruthMessage(payload?.error || 'Refresh failed.');
                  return;
                }
                setWinnerTruth(payload as WinnerTruthReport);
                setTruthState('success');
              } catch {
                setTruthState('error');
                setTruthMessage('Refresh failed.');
              }
            }}
            className="inline-flex foldera-touch-height items-center justify-center foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary disabled:opacity-60"
          >
            {truthState === 'loading' ? 'Refreshing…' : 'Refresh truth'}
          </button>
        </div>

        {truthMessage && (
          <p className={`mt-4 text-xs ${truthState === 'error' ? 'text-text-primary' : 'text-text-secondary'}`}>
            {truthMessage}
          </p>
        )}

        {truthState === 'loading' && !winnerTruth && (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="h-32 animate-pulse rounded-card border border-border bg-panel-raised" />
            <div className="h-32 animate-pulse rounded-card border border-border bg-panel-raised" />
            <div className="h-32 animate-pulse rounded-card border border-border bg-panel-raised" />
            <div className="h-32 animate-pulse rounded-card border border-border bg-panel-raised" />
          </div>
        )}

        {winnerTruth && (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">What Foldera knows now</h3>
              <p className="mt-3 text-sm text-text-primary">
                {winnerTruth.current_winner.verdict === 'selected' && winnerTruth.current_winner.title
                  ? winnerTruth.current_winner.title
                  : 'No safe artifact today'}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {winnerTruth.top_viable_candidates.length} viable Tier 1 or Tier 2 candidate{winnerTruth.top_viable_candidates.length === 1 ? '' : 's'} are present right now.
              </p>
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">What is stale</h3>
              <div className="mt-3 space-y-2 text-sm text-text-primary">
                {winnerTruth.sync_health.providers.map((provider) => (
                  <p key={provider.provider}>
                    {provider.provider}: {provider.stale ? `stale (${provider.age_hours ?? '?'}h)` : `fresh (${provider.age_hours ?? 0}h)`}
                  </p>
                ))}
                <p>
                  Graph: {winnerTruth.sync_health.graph.graph_stale
                    ? `${winnerTruth.sync_health.graph.stale_entity_count} stale entity rows`
                    : 'fresh enough for current winner selection'}
                </p>
                <p>Decrypt fallbacks: {winnerTruth.sync_health.decrypt_fallback_count}</p>
              </div>
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">What won today</h3>
              <p className="mt-3 text-sm text-text-primary">
                {winnerTruth.current_winner.verdict === 'selected'
                  ? winnerTruth.current_winner.title
                  : 'No safe artifact today'}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {winnerTruth.current_winner.tier ?? 'no tier'} {winnerTruth.current_winner.artifact_family ? `· ${winnerTruth.current_winner.artifact_family}` : ''}
              </p>
              {winnerTruth.current_winner.note && (
                <p className="mt-2 text-xs text-text-secondary">{winnerTruth.current_winner.note}</p>
              )}
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Good candidates present</h3>
              <div className="mt-3 space-y-3">
                {winnerTruth.top_viable_candidates.length === 0 ? (
                  <p className="text-sm text-text-secondary">No Tier 1 or Tier 2 candidate is currently strong enough to trust.</p>
                ) : winnerTruth.top_viable_candidates.slice(0, 3).map((candidate) => (
                  <div key={candidate.candidate_id} className="text-sm text-text-primary">
                    <p>{candidate.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {candidate.tier} · {candidate.artifact_family}
                    </p>
                    {candidate.missing_blockers && candidate.missing_blockers.length > 0 && (
                      <p className="mt-1 text-xs text-text-secondary">
                        Needs: {candidate.missing_blockers.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">What almost won but got blocked</h3>
              <div className="mt-3 space-y-3">
                {winnerTruth.blocked_candidates.length === 0 ? (
                  <p className="text-sm text-text-secondary">Nothing important is currently blocked out.</p>
                ) : winnerTruth.blocked_candidates.slice(0, 3).map((candidate) => (
                  <div key={candidate.candidate_id} className="text-sm text-text-primary">
                    <p>{candidate.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">{candidate.blockers.join(' · ')}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">What in the graph is lying</h3>
              <div className="mt-3 space-y-3">
                {winnerTruth.graph_drift.length === 0 ? (
                  <p className="text-sm text-text-secondary">Top relationship counts match the current signal metadata.</p>
                ) : winnerTruth.graph_drift.slice(0, 4).map((entry) => (
                  <div key={entry.name} className="text-sm text-text-primary">
                    <p>{entry.name}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      90d count stored {entry.stored.signal_count_90d}, actual {entry.actual.signal_count_90d}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-card border border-border bg-panel-raised p-4">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Last three days</h3>
              <div className="mt-3 space-y-3">
                {winnerTruth.three_day_consistency.days.map((day) => (
                  <div key={day.day} className="text-sm text-text-primary">
                    <p>{day.day}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {day.classification === 'useful_artifact'
                        ? 'Useful artifact'
                        : day.classification === 'no_safe_artifact'
                          ? 'Precise no-safe-artifact'
                          : 'Garbage regression'}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">{day.summary}</p>
                  </div>
                ))}
                <p className="text-xs text-text-secondary">
                  {winnerTruth.three_day_consistency.passes
                    ? 'The last three days stayed inside the allowed outcomes.'
                    : 'At least one of the last three days still regressed to a low-value output.'}
                </p>
              </div>
            </article>
          </div>
        )}

        {winnerTruth && winnerTruth.polluted_entities.length > 0 && (
          <div className="mt-6 rounded-card border border-border bg-panel-raised p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Polluted entities</h3>
            <div className="mt-3 space-y-2 text-sm text-text-primary">
              {winnerTruth.polluted_entities.slice(0, 5).map((entity) => (
                <p key={entity.id}>
                  {entity.name} · {entity.reason}
                </p>
              ))}
            </div>
          </div>
        )}

        {winnerTruth && winnerTruth.action_needed.length > 0 && (
          <div className="mt-6 rounded-card border border-border bg-panel-raised p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Action needed</h3>
            <div className="mt-3 space-y-2 text-sm text-text-primary">
              {winnerTruth.action_needed.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        )}

        {winnerTruth && winnerTruth.future_findings.length > 0 && (
          <div className="mt-6 rounded-card border border-border bg-panel-raised p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-text-secondary">Deeper findings</h3>
            <div className="mt-3 space-y-4 text-sm text-text-primary">
              {winnerTruth.future_findings.slice(0, 4).map((finding) => (
                <div key={`${finding.classification}-${finding.finding}`}>
                  <p>
                    {finding.classification === 'current_blocker'
                      ? 'Current blocker'
                      : finding.classification === 'adjacent_risk'
                        ? 'Adjacent risk'
                        : 'Future backlog'}
                    {' · '}
                    {finding.finding.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">{finding.evidence}</p>
                  <p className="mt-1 text-xs text-text-secondary">{finding.smallest_next_move}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Generate</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Dry run validates pipeline flow. AI generate consumes credits and daily limits.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={runState === 'loading' || aiRunState === 'loading'}
            onClick={async () => {
              const now = Date.now();
              if (now - lastPipelineRunRef.current < 30000) {
                setRunMessage('Please wait 30 seconds before trying again.');
                return;
              }
              lastPipelineRunRef.current = now;
              setRunState('loading');
              setRunMessage(null);
              try {
                const response = await fetch('/api/settings/run-brief?force=true&dry_run=true', { method: 'POST' });
                const payload = await response.json().catch(() => null);
                if (response.ok && (payload?.ok || payload?.stages)) {
                  setRunState('success');
                  setRunMessage('Dry run finished.');
                  return;
                }
                setRunState('error');
                setRunMessage(payload?.error || 'Dry run failed.');
              } catch {
                setRunState('error');
                setRunMessage('Network error during dry run.');
              }
            }}
            className="inline-flex foldera-touch-height items-center justify-center foldera-button-radius bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg disabled:opacity-60"
          >
            {runState === 'loading' ? 'Running dry run…' : 'Run pipeline (dry run)'}
          </button>

          <button
            type="button"
            disabled={aiRunState === 'loading' || runState === 'loading'}
            onClick={async () => {
              if (!window.confirm('Generate with AI uses Anthropic credits. Continue?')) return;
              const now = Date.now();
              if (now - lastPipelineRunRef.current < 30000) {
                setAiRunMessage('Please wait 30 seconds before trying again.');
                return;
              }
              lastPipelineRunRef.current = now;
              setAiRunState('loading');
              setAiRunMessage(null);
              try {
                const response = await fetch('/api/settings/run-brief?force=true&use_llm=true', { method: 'POST' });
                const payload = await response.json().catch(() => null);
                const spend = payload?.spend_policy as
                  | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
                  | undefined;
                if (spend?.paid_llm_requested && spend?.pipeline_dry_run) {
                  setAiRunState('error');
                  setAiRunMessage('Paid generation is disabled on this deployment.');
                  return;
                }
                if (response.ok && (payload?.ok || payload?.stages)) {
                  setAiRunState('success');
                  setAiRunMessage('AI generate finished.');
                  return;
                }
                setAiRunState('error');
                setAiRunMessage(payload?.error || 'AI generate failed.');
              } catch {
                setAiRunState('error');
                setAiRunMessage('Network error during AI generate.');
              }
            }}
            className="inline-flex foldera-touch-height items-center justify-center foldera-button-radius border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary disabled:opacity-60"
          >
            {aiRunState === 'loading' ? 'Running AI generate…' : 'Generate with AI'}
          </button>
        </div>

        {runMessage && (
          <p className={`mt-4 text-xs ${runState === 'error' ? 'text-text-primary' : 'text-text-secondary'}`}>
            {runMessage}
          </p>
        )}
        {aiRunMessage && (
          <p className={`mt-2 text-xs ${aiRunState === 'error' ? 'text-text-primary' : 'text-text-secondary'}`}>
            {aiRunMessage}
          </p>
        )}
      </section>

      {agentsEnabled !== null && (
        <section className="mt-4 rounded-card border border-border bg-panel p-6">
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Autonomous agents</h2>
          <p className="mt-3 text-sm text-text-secondary">
            Scheduled jobs stage drafts for review. Disable to pause agent runs immediately.
          </p>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm text-text-primary">Agents enabled</p>
            <button
              type="button"
              disabled={agentsSaving}
              onClick={async () => {
                setAgentsSaving(true);
                try {
                  const next = !agentsEnabled;
                  const response = await fetch('/api/settings/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: next }),
                  });
                  if (response.ok) setAgentsEnabled(next);
                } finally {
                  setAgentsSaving(false);
                }
              }}
              className={`relative h-8 w-14 rounded-pill ${agentsEnabled ? 'bg-success' : 'bg-panel-raised'} ${agentsSaving ? 'opacity-60' : ''}`}
              aria-pressed={agentsEnabled}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-pill bg-text-primary transition-transform ${
                  agentsEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>
      )}

      <section className="mt-4">
        <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Draft queue</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Approve to persist an artifact. Skip to train the agent.
        </p>
        <AgentSystemPanel />
      </section>
    </ProductShell>
  );
}
