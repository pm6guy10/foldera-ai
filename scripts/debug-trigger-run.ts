/**
 * Trigger a production dry-run and capture the new winner.
 * Uses the service role key to call the production API with auth bypass.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { requireProdProofAllowed } from './prod-proof-guard';
dotenv.config({ path: '.env.local' });

const PROD_URL = 'https://foldera.ai';
const CRON_SECRET = process.env.CRON_SECRET!;
const OWNER = process.env.INGEST_USER_ID!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  requireProdProofAllowed('debug-trigger-run');

  console.log('Triggering production pipeline run via nightly-ops...');
  
  // Trigger nightly-ops (which runs the full scoring pipeline)
  const triggerResp = await fetch(`${PROD_URL}/api/cron/nightly-ops`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
  });
  
  console.log('Trigger status:', triggerResp.status);
  
  // Wait for it to complete
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  // Check the latest pipeline run
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras,gate_funnel')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('\n=== LATEST PIPELINE RUNS AFTER FIX ===');
  for (const r of runs ?? []) {
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
      winner_candidate_id: r.raw_extras?.winner_candidate_id,
      winner_decision_reason: r.raw_extras?.winner_decision_reason,
    });
  }
  
  // Also check tkg_actions for any new action created
  const { data: actions } = await sb.from('tkg_actions')
    .select('id,action_type,confidence,generated_at,status')
    .eq('user_id', OWNER)
    .order('generated_at', { ascending: false })
    .limit(3);
  
  console.log('\n=== LATEST TKG ACTIONS ===', actions);
}

main().catch(console.error);
