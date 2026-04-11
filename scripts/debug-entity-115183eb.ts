import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, emails, user_id')
    .eq('id', '115183eb-3f49-438c-b1cd-f5b67eb15f1f')
    .single();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Entity:', JSON.stringify(data, null, 2));
  }

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('id, created_at, outcome, winner_candidate_id, winner_action_type, winner_confidence, winner_decision_reason')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nLatest pipeline_runs:', JSON.stringify(runs, null, 2));
}

main().catch(console.error);
