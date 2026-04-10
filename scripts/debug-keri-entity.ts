import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Get all entities with "keri" in name
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, total_interactions, last_interaction, patterns')
    .eq('user_id', userId);

  const keriEntities = (entities ?? []).filter(e => 
    (e.name as string).toLowerCase().includes('keri')
  );
  console.log('=== KERI ENTITIES ===');
  console.log(JSON.stringify(keriEntities, null, 2));

  // Get all entities with >=5 interactions
  const withInteractions = (entities ?? []).filter(e => (e.total_interactions as number) >= 5);
  console.log('\n=== ALL ENTITIES WITH >=5 INTERACTIONS ===');
  for (const e of withInteractions) {
    const bxStats = ((e.patterns as Record<string, unknown>)?.bx_stats ?? {}) as Record<string, unknown>;
    console.log(`  ${e.name} (${e.primary_email ?? 'no email'}) - ${e.total_interactions} interactions | silence=${bxStats.silence_detected} | 90d=${bxStats.signal_count_90d}`);
  }

  // Check the actual entity detection query in scorer — entities with silence_detected=true
  const silentEntities = withInteractions.filter(e => {
    const bx = ((e.patterns as Record<string, unknown>)?.bx_stats ?? {}) as Record<string, unknown>;
    return bx.silence_detected === true;
  });
  console.log('\n=== SILENT ENTITIES (silence_detected=true, >=5 interactions) ===');
  for (const e of silentEntities) {
    const bx = ((e.patterns as Record<string, unknown>)?.bx_stats ?? {}) as Record<string, unknown>;
    const now = Date.now();
    const lastMs = e.last_interaction ? new Date(e.last_interaction as string).getTime() : 0;
    const daysSilent = Math.floor((now - lastMs) / 86400000);
    console.log(`  ${e.name} (${e.primary_email ?? 'no email'}) - ${e.total_interactions} interactions | silence=${bx.silence_detected} | 90d=${bx.signal_count_90d} | ${daysSilent}d silent`);
  }
  
  // Check the actual entities table column names
  const { data: sampleEntity } = await supabase
    .from('tkg_entities')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();
  
  if (sampleEntity) {
    console.log('\n=== SAMPLE ENTITY COLUMN NAMES ===');
    console.log(Object.keys(sampleEntity).join(', '));
    console.log('\ninteraction_count:', (sampleEntity as Record<string, unknown>).interaction_count);
    console.log('total_interactions:', (sampleEntity as Record<string, unknown>).total_interactions);
  }
}

main().catch(console.error);
