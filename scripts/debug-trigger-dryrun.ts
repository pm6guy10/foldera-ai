/**
 * Query for the latest pipeline run after fix deployment.
 * The settings run-brief needs a user session cookie which we don't have here.
 * Instead, check if there's been a new run since the deploy.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { requireProdProofAllowed } from './prod-proof-guard';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;
const DEPLOY_TIME = '2026-04-10T13:41:00Z'; // After deploy confirmed at 13:41

async function main() {
  requireProdProofAllowed('debug-trigger-dryrun');

  // Check pipeline runs since deploy
  const { data: newRuns } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .gte('created_at', DEPLOY_TIME)
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('=== PIPELINE RUNS AFTER DEPLOY ===');
  console.log(newRuns?.length ?? 0, 'runs since deploy');
  for (const r of newRuns ?? []) {
    console.log({
      created_at: r.created_at,
      winner_candidate_id: r.raw_extras?.winner_candidate_id,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
    });
  }
  
  // If no new runs, we need to trigger one via daily-brief with CRON_SECRET
  if (!newRuns?.length) {
    console.log('\nNo new runs since deploy. Triggering daily-brief cron...');
    const CRON_SECRET = process.env.CRON_SECRET!;
    const resp = await fetch('https://foldera.ai/api/cron/daily-brief', {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${CRON_SECRET}`, 'Content-Type': 'application/json' },
    });
    console.log('daily-brief status:', resp.status);
    const body = await resp.json().catch(() => ({}));
    console.log('daily-brief response preview:', JSON.stringify(body).slice(0, 500));
    
    // Wait for completion
    await new Promise(r => setTimeout(r, 20000));
    
    // Check again
    const { data: newRuns2 } = await sb.from('pipeline_runs')
      .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
      .eq('user_id', OWNER)
      .gte('created_at', DEPLOY_TIME)
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('\n=== PIPELINE RUNS AFTER TRIGGER ===');
    for (const r of newRuns2 ?? []) {
      console.log({
        created_at: r.created_at,
        winner_candidate_id: r.raw_extras?.winner_candidate_id,
        winner_action_type: r.winner_action_type,
        winner_confidence: r.winner_confidence,
      });
    }
  }
}

main().catch(console.error);
