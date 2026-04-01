import type { SupabaseClient } from '@supabase/supabase-js';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { runAgentSonnet } from '@/lib/agents/anthropic-runner';
import { buildSkipAvoidanceBlock } from '@/lib/agents/skip-patterns';

export async function runSelfOptimizerAgent(supabase: SupabaseClient): Promise<{
  staged: boolean;
  summary: string;
}> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const avoid = await buildSkipAvoidanceBlock(supabase, 'self_optimizer');

  const { data: rows } = await supabase
    .from('tkg_actions')
    .select('action_type, status, confidence, skip_reason')
    .gte('generated_at', since)
    .in('status', ['executed', 'approved', 'skipped', 'draft_rejected', 'failed', 'pending_approval']);

  const byType: Record<
    string,
    { n: number; approved: number; skipped: number; sumConfApproved: number; sumConfSkipped: number; skipReasons: string[] }
  > = {};

  for (const r of rows ?? []) {
    const t = String(r.action_type ?? 'unknown');
    if (!byType[t]) {
      byType[t] = { n: 0, approved: 0, skipped: 0, sumConfApproved: 0, sumConfSkipped: 0, skipReasons: [] };
    }
    const b = byType[t];
    b.n++;
    const st = r.status as string;
    const conf = typeof r.confidence === 'number' ? r.confidence : 0;
    if (st === 'executed' || st === 'approved') {
      b.approved++;
      b.sumConfApproved += conf;
    }
    if (st === 'skipped' || st === 'draft_rejected') {
      b.skipped++;
      b.sumConfSkipped += conf;
      if (typeof r.skip_reason === 'string' && r.skip_reason) {
        b.skipReasons.push(r.skip_reason);
      }
    }
  }

  const lines = Object.entries(byType).map(([t, b]) => {
    const rate = b.approved + b.skipped > 0 ? b.approved / (b.approved + b.skipped) : 0;
    const avgA = b.approved ? b.sumConfApproved / b.approved : 0;
    const avgS = b.skipped ? b.sumConfSkipped / b.skipped : 0;
    const topSkip = b.skipReasons.slice(0, 5);
    return `${t}: decisions=${b.approved + b.skipped}, approval_rate=${(rate * 100).toFixed(1)}%, avg_conf_approved=${avgA.toFixed(1)}, avg_conf_skipped=${avgS.toFixed(1)}, sample_skip_reasons=${JSON.stringify(topSkip)}`;
  });

  const totalApproved = Object.values(byType).reduce((s, b) => s + b.approved, 0);
  const totalSkipped = Object.values(byType).reduce((s, b) => s + b.skipped, 0);
  const globalRate = totalApproved + totalSkipped > 0 ? totalApproved / (totalApproved + totalSkipped) : 1;

  let analyticsNote = 'Landing analytics: not connected (set POSTHOG_KEY in agent env to enable).';
  if (process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID) {
    analyticsNote =
      'PostHog credentials present — wire a read API query in a follow-up session; this run skips network analytics pulls.';
  }

  const statsBlock = [
    `Global approval rate (7d, approved vs skipped): ${(globalRate * 100).toFixed(1)}%`,
    '',
    'Per action_type:',
    ...lines,
    '',
    analyticsNote,
  ].join('\n');

  const sonnet = await runAgentSonnet({
    job: 'self_optimizer',
    system: [
      'You are a product analyst for Foldera.',
      'Given weekly tkg_actions stats, produce:',
      '1) What is working',
      '2) What is not',
      '3) Specific recommendations',
      'If global approval rate < 20%, include a section SYSTEM_PROMPT_CHANGES with exact replacement wording blocks for the directive generator.',
      'If any action_type has 0% approval among rows with both approvals and skips, recommend suppressing or tightening that type.',
      avoid,
    ].join('\n'),
    messages: [{ role: 'user', content: statsBlock }],
  });

  if ('error' in sonnet) {
    return { staged: false, summary: sonnet.error };
  }

  const ins = await insertAgentDraft(supabase, 'self_optimizer', {
    title: 'Weekly product intelligence',
    directiveLine: 'Self-Optimizer: 7-day approval and skip analysis.',
    body: ['## Stats', '', statsBlock, '', '## Model analysis', '', sonnet.text].join('\n'),
    fixPrompt:
      globalRate < 0.2
        ? 'Implement the SYSTEM_PROMPT_CHANGES section from the report in lib/briefing/generator.ts. Re-run vitest briefing suites.'
        : 'Review recommendations and pick one measurable change for the next ship.',
  });

  if ('error' in ins) {
    return { staged: false, summary: ins.error };
  }

  return { staged: true, summary: `draft ${ins.id}` };
}
