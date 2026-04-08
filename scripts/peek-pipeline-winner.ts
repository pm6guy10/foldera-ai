/**
 * Read-only: latest pipeline_runs + tkg_actions generation_log for audit/owner user.
 * npm run peek:pipeline-winner  (add to package.json optional)
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || '').trim();
  if (!url || !key || !userId) {
    console.error('Missing URL, key, or AUDIT_USER_ID/OWNER_USER_ID');
    process.exit(1);
  }
  const db = createClient(url, key);

  const { data: runs, error: rErr } = await db
    .from('pipeline_runs')
    .select(
      'id, created_at, phase, invocation_source, outcome, winner_action_type, winner_confidence, blocked_gate, gate_funnel, raw_extras',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (rErr) {
    console.error('pipeline_runs:', rErr.message);
    process.exit(1);
  }

  console.log('\n=== Last 5 pipeline_runs (your user) ===\n');
  for (const row of runs ?? []) {
    console.log('—'.repeat(60));
    console.log('created_at:', row.created_at);
    console.log('phase:', row.phase, '| source:', row.invocation_source);
    console.log('outcome:', row.outcome);
    console.log('winner_action_type:', row.winner_action_type, '| confidence:', row.winner_confidence);
    console.log('blocked_gate (first 500 chars):');
    console.log((row.blocked_gate as string)?.slice(0, 500) ?? '(null)');
    const rx = row.raw_extras as Record<string, unknown> | null;
    if (rx?.winner_candidate_id) console.log('raw_extras.winner_candidate_id:', rx.winner_candidate_id);
    if (rx?.winner_decision_reason)
      console.log('raw_extras.winner_decision_reason:', String(rx.winner_decision_reason).slice(0, 400));
    const gf = row.gate_funnel as Record<string, unknown> | null;
    if (gf?.final_outcome != null) console.log('gate_funnel.final_outcome:', gf.final_outcome);
    console.log('');
  }

  const { data: actions, error: aErr } = await db
    .from('tkg_actions')
    .select('id, status, action_type, directive_text, confidence, generated_at, execution_result')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false, nullsFirst: false })
    .limit(3);

  if (aErr) {
    console.error('tkg_actions:', aErr.message);
    process.exit(1);
  }

  console.log('\n=== Last 3 tkg_actions — generation candidate snapshot ===\n');
  for (const a of actions ?? []) {
    const er = a.execution_result as Record<string, unknown> | null;
    const gl = er?.generation_log as Record<string, unknown> | null;
    const cd = gl?.candidateDiscovery as Record<string, unknown> | null;
    const top = cd?.topCandidates as unknown[] | undefined;
    console.log('—'.repeat(60));
    console.log('id:', a.id, '| status:', a.status, '| type:', a.action_type);
    console.log('generated_at:', a.generated_at, '| confidence:', a.confidence);
    console.log('directive_text (first 200):', String(a.directive_text ?? '').slice(0, 200));
    if (top?.length) {
      const first = top[0] as Record<string, unknown>;
      console.log('top candidate[0] id:', first.id);
      console.log('top candidate[0] type:', first.candidateType, '| action:', first.actionType);
      console.log('top candidate[0] score:', first.score, '| decision:', first.decision);
      console.log('top candidate[0] decisionReason:', first.decisionReason ?? '(none)');
      if (first.discrepancyClass) console.log('top candidate[0] discrepancyClass:', first.discrepancyClass);
    } else {
      console.log('(no topCandidates in generation_log)');
    }
    if (gl?.stage) console.log('generation_log.stage:', gl.stage);
    if (gl?.reason) console.log('generation_log.reason (first 300):', String(gl.reason).slice(0, 300));
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
