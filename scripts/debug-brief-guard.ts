import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  const { data } = await sb.from('tkg_users')
    .select('id,daily_brief_sent_at,brief_status')
    .eq('id', OWNER)
    .single();
  
  console.log('=== DAILY BRIEF GUARD STATE ===');
  console.log('brief_status:', (data as any)?.brief_status);
  console.log('daily_brief_sent_at:', (data as any)?.daily_brief_sent_at);
  
  const sentAt = (data as any)?.daily_brief_sent_at;
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = sentAt?.slice(0, 10) === today;
  console.log('sent today:', sentToday);
  
  // Also check latest pipeline run timestamps
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('\n=== LATEST 5 PIPELINE RUNS ===');
  for (const r of runs ?? []) {
    const re = r.raw_extras as Record<string, unknown> | null;
    const isnoreply = (re?.winner_candidate_id as string | undefined)?.includes('08b906c3') || 
                      (re?.winner_candidate_id as string | undefined)?.includes('5b851583');
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_candidate_id: re?.winner_candidate_id,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
      is_noreply: isnoreply,
    });
  }
  
  // Check what time zone and current time
  console.log('\nNow UTC:', new Date().toISOString());
  console.log('Today date:', today);
}

main().catch(console.error);
