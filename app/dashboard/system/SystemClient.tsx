'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { AgentSystemPanel } from '@/components/dashboard/AgentSystemPanel';

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
            className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg disabled:opacity-60"
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
            className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary disabled:opacity-60"
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
