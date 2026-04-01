import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentJobId } from '@/lib/agents/constants';
import { areAgentsEnabled } from '@/lib/agents/agents-enabled';
import { hasAgentBudget } from '@/lib/agents/cost-guard';
import { runHealthWatchdogAgent } from '@/lib/agents/health-watchdog';
import { runGtmStrategistAgent } from '@/lib/agents/gtm-strategist';
import { runDistributionFinderAgent } from '@/lib/agents/distribution-finder';
import { runRetentionAnalystAgent } from '@/lib/agents/retention-analyst';
import { runSelfOptimizerAgent } from '@/lib/agents/self-optimizer';

export async function runScheduledAgent(
  supabase: SupabaseClient,
  job: AgentJobId,
): Promise<{ ok: boolean; job: AgentJobId; detail: Record<string, unknown> }> {
  const enabled = await areAgentsEnabled(supabase);
  if (!enabled) {
    return { ok: true, job, detail: { skipped: true, reason: 'agents_disabled' } };
  }

  const budget = await hasAgentBudget(job);
  if (!budget.ok) {
    return {
      ok: true,
      job,
      detail: { skipped: true, reason: 'budget_exhausted', spent: budget.spent, cap: budget.cap },
    };
  }

  switch (job) {
    case 'health_watchdog': {
      const r = await runHealthWatchdogAgent(supabase);
      return { ok: true, job, detail: { staged: r.staged, summary: r.summary } };
    }
    case 'ui_critic': {
      return {
        ok: true,
        job,
        detail: {
          skipped: true,
          reason: 'ui_critic_runs_in_github_actions',
          hint: 'workflow agents-ui-critic.yml',
        },
      };
    }
    case 'gtm_strategist': {
      const r = await runGtmStrategistAgent(supabase);
      return { ok: true, job, detail: { staged: r.staged, summary: r.summary } };
    }
    case 'distribution_finder': {
      const r = await runDistributionFinderAgent(supabase);
      return { ok: true, job, detail: { staged: r.staged, summary: r.summary } };
    }
    case 'retention_analyst': {
      const r = await runRetentionAnalystAgent(supabase);
      return { ok: true, job, detail: { staged: r.staged, summary: r.summary } };
    }
    case 'self_optimizer': {
      const r = await runSelfOptimizerAgent(supabase);
      return { ok: true, job, detail: { staged: r.staged, summary: r.summary } };
    }
    default:
      return { ok: false, job, detail: { error: 'unknown_job' } };
  }
}
