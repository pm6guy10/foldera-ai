/**
 * Trigger nightly-ops after the fix deploy to get a fresh winner.
 * Waits for the run to complete and shows the new winner.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { requireProdProofAllowed } from './prod-proof-guard';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  requireProdProofAllowed('debug-trigger-post-fix');

  const CRON_SECRET = process.env.CRON_SECRET!;
  
  // Timestamp before trigger
  const before = new Date().toISOString();
  console.log('Triggering nightly-ops at:', before);
  
  const resp = await fetch('https://foldera.ai/api/cron/nightly-ops', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(90000),
  });
  
  console.log('nightly-ops status:', resp.status);
  const body = await resp.json().catch(() => ({})) as Record<string, unknown>;
  
  // Check pipeline_runs for the winner from this trigger
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras,gate_funnel')
    .eq('user_id', OWNER)
    .gte('created_at', before)
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('\n=== NEW PIPELINE RUNS (post fix deploy) ===');
  for (const r of runs ?? []) {
    const re = r.raw_extras as Record<string, unknown> | null;
    const gf = r.gate_funnel as Record<string, unknown> | null;
    const fsStage = (gf?.filter_stages as Array<{stage:string,before:number,after:number,dropped_count:number}> | undefined)
      ?.find(s => s.stage === 'failure_suppression');
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_candidate_id: re?.winner_candidate_id,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
      winner_decision_reason: re?.winner_decision_reason,
      failure_suppression_dropped: fsStage?.dropped_count,
    });
  }
  
  // Show nightly-ops outcome
  console.log('\nnightly-ops summary:');
  console.log('stage_results:', JSON.stringify((body.stage_results as unknown[])?.map((s: unknown) => {
    const sr = s as Record<string, unknown>;
    return { stage: sr.stage, status: sr.status };
  })));
}

main().catch(console.error);
