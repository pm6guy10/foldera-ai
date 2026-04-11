import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check what action was created for this winner (it's a dry run so probably in tkg_actions as pending_approval)
  const { data: actions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, status, artifact_type, candidate_reason, generated_at, generation_log')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .order('generated_at', { ascending: false })
    .limit(5);

  console.log('Recent tkg_actions:', JSON.stringify(actions, null, 2));

  // Check what behavioral pattern candidates look like
  // The candidate_id is "discrepancy_bp_theme_deadline"
  // This comes from discrepancy-detector.ts extractBehavioralPatterns
  // Let's also check the commitments for deadline context
  const { data: commitments } = await supabase
    .from('tkg_commitments')
    .select('id, description, type, status, due_date, suppressed_at')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .is('suppressed_at', null)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(10);

  console.log('\nUpcoming commitments with deadlines:', JSON.stringify(commitments, null, 2));
}

main().catch(console.error);
