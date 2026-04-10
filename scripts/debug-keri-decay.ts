import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Find Keri entity
  const { data: keriEntities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, last_interaction, total_interactions, patterns')
    .eq('user_id', userId)
    .ilike('name', '%keri%');

  console.log('Keri entities:', JSON.stringify(keriEntities, null, 2));

  // Find Yadira entity
  const { data: yadiraEntities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, last_interaction, total_interactions, patterns')
    .eq('user_id', userId)
    .ilike('name', '%yadira%');

  console.log('\nYadira entities:', JSON.stringify(yadiraEntities, null, 2));

  // Check commitments for these entities
  const entityIds = [
    ...(keriEntities || []).map(e => e.id),
    ...(yadiraEntities || []).map(e => e.id),
  ];

  if (entityIds.length > 0) {
    const { data: commitments } = await supabase
      .from('tkg_commitments')
      .select('id, description, status, due_at, confidence, entity_id')
      .eq('user_id', userId)
      .in('entity_id', entityIds)
      .is('suppressed_at', null);
    console.log('\nActive commitments:', JSON.stringify(commitments, null, 2));
  }

  // Check recent signals for Keri
  if ((keriEntities || []).length > 0) {
    const keriId = keriEntities![0].id;
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('id, type, source, occurred_at, processed')
      .eq('user_id', userId)
      .eq('entity_id', keriId)
      .order('occurred_at', { ascending: false })
      .limit(10);
    console.log('\nKeri recent signals:', JSON.stringify(signals, null, 2));
  }

  // Check the discrepancy_decay run that previously had Keri as winner
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('created_at, outcome, winner_action_type, winner_confidence, blocked_gate, raw_extras')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n=== Recent pipeline runs ===');
  runs?.forEach(r => {
    const e = r.raw_extras as Record<string, unknown>;
    const winnerId = e?.winner_candidate_id as string | undefined;
    if (winnerId?.includes('decay') || winnerId?.includes('aa7733d9')) {
      console.log(`${r.created_at}: outcome=${r.outcome} winner=${winnerId} blocked=${r.blocked_gate?.toString().slice(0, 100)}`);
    }
  });

  // Check last pipeline run with decay in top candidates
  console.log('\n=== Latest run raw_extras topCandidates ===');
  const latestRun = runs?.[0];
  if (latestRun?.raw_extras) {
    const e = latestRun.raw_extras as Record<string, unknown>;
    const disc = e.candidateDiscovery as Record<string, unknown> | undefined;
    console.log('candidateDiscovery:', JSON.stringify(disc?.topCandidates, null, 2));
    console.log('candidateFailureReasons:', JSON.stringify(e.candidateFailureReasons, null, 2));
  }
}

main().catch(console.error);
