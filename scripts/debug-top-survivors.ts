import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the most recent run and look at all info
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const gf = run?.gate_funnel as Record<string, unknown>;
  console.log('Winner candidate_id:', (run?.raw_extras as Record<string, unknown>)?.winner_candidate_id);
  console.log('Winner decision_reason:', (run?.raw_extras as Record<string, unknown>)?.winner_decision_reason);
  console.log('Winner action_type:', run?.winner_action_type);
  console.log('Winner confidence:', run?.winner_confidence);

  // Check the rejection_filter_entities to see who passed
  const rejectedEntities = gf?.rejection_filter_entities as string[] | undefined;
  console.log('\nEntities that passed entity_reality_gate (NOT in rejected list):');
  console.log('Total entities (entities_raw):', (gf?.source_counts as Record<string,unknown>)?.entities_raw);

  // Check what entities are in the DB for this user
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, last_interaction, interaction_count')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .order('interaction_count', { ascending: false })
    .limit(20);

  console.log('\nTop entities by interaction count:');
  for (const e of entities ?? []) {
    const isRejected = rejectedEntities?.some(r => r.toLowerCase() === (e.name as string).toLowerCase());
    const marker = isRejected ? '  [REJECTED]' : '  [PASSED]';
    console.log(`${marker} ${e.name} (${e.primary_email ?? 'no email'}) - ${e.interaction_count} interactions, last: ${e.last_interaction?.slice(0,10)}`);
  }
}

main().catch(console.error);
