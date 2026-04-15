/**
 * Trigger a settings run-brief for the owner user via cron auth.
 * Uses INGEST_USER_ID to identify the production user.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  const before = new Date().toISOString();
  console.log('Checking nightly-ops result from', before);
  
  // Check recent pipeline_runs created since deploy
  const deployTime = '2026-04-10T17:55:00Z';
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras,gate_funnel')
    .eq('user_id', OWNER)
    .gte('created_at', deployTime)
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('=== RUNS SINCE DEPLOY ===');
  console.log('Count:', runs?.length ?? 0);
  for (const r of runs ?? []) {
    const re = r.raw_extras as Record<string, unknown> | null;
    const winnerId = re?.winner_candidate_id as string | undefined;
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_candidate_id: winnerId,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
    });
  }
  
  // Check tkg_actions since deploy to see what nightly-ops did
  const { data: actions } = await sb.from('tkg_actions')
    .select('id,created_at,action_type,status,confidence,meta,execution_result')
    .eq('user_id', OWNER)
    .gte('created_at', deployTime)
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('\n=== ACTIONS SINCE DEPLOY ===');
  console.log('Count:', actions?.length ?? 0);
  for (const a of actions ?? []) {
    const m = a.meta as Record<string, unknown> | null;
    const er = a.execution_result as Record<string, unknown> | null;
    const genLog = er?.generation_log as Record<string, unknown> | undefined;
    console.log({
      created_at: a.created_at,
      action_type: a.action_type,
      status: a.status,
      confidence: a.confidence,
      candidate_id: m?.candidate_id,
      gen_stage: genLog?.stage,
      gen_outcome: genLog?.outcome,
    });
  }
  
  // Also check if health endpoint returns the new SHA
  const healthResp = await fetch('https://foldera.ai/api/health');
  const health = await healthResp.json() as Record<string, unknown>;
  const revision = health.revision as Record<string, unknown> | undefined;
  console.log('\n=== PRODUCTION HEALTH ===');
  console.log('git_sha:', revision?.git_sha);
  console.log('expected sha: 7f4cf55a2a1e69e41c34a8f889b002dd6fa13ec2');
  console.log('match:', revision?.git_sha === '7f4cf55a2a1e69e41c34a8f889b002dd6fa13ec2');
}

main().catch(console.error);
