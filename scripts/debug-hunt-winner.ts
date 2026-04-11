import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  // hunt_unreplied_08b906c3-3e54-4981-b541-1ad868bfd43e
  // The UUID part is the signal ID
  const signalId1 = '08b906c3-3e54-4981-b541-1ad868bfd43e';
  const signalId2 = '5b851583-cc47-4c89-9ca5-9accd2d36b29';
  
  // Look up both signals
  const { data: signals } = await sb
    .from('tkg_signals')
    .select('id,source,type,occurred_at,author,processed,content,extracted_entities')
    .eq('user_id', OWNER)
    .in('id', [signalId1, signalId2]);
  
  console.log('=== HUNT WINNER SIGNALS ===');
  for (const s of signals ?? []) {
    const content = s.content as Record<string, unknown> | null;
    const entities = s.extracted_entities as Array<Record<string, unknown>> | null;
    console.log(`\n--- Signal ${s.id} ---`);
    console.log('source:', s.source);
    console.log('type:', s.type);
    console.log('occurred_at:', s.occurred_at);
    console.log('author:', s.author);
    console.log('subject:', content?.subject);
    console.log('from:', content?.from);
    console.log('to:', content?.to);
    console.log('entities:', JSON.stringify(entities?.map(e => e.entity_id)));
    console.log('processed:', s.processed);
  }
  
  // Get full entity list that passed entity_reality_gate from latest run
  // From the gate funnel: entities_raw=30 
  const { data: entities } = await sb
    .from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction,trust_class')
    .eq('user_id', OWNER)
    .order('total_interactions', { ascending: false })
    .limit(15);
  
  console.log('\n=== TOP ENTITIES BY INTERACTIONS ===');
  for (const e of entities ?? []) {
    console.log(`  ${e.id} | ${e.name} | email=${e.primary_email} | interactions=${e.total_interactions} | last=${e.last_interaction?.slice(0,10)} | trust=${e.trust_class}`);
  }
  
  // Check if signal entities map to real people
  const { data: sigEntities } = await sb
    .from('tkg_signals')
    .select('id,extracted_entities,content')
    .eq('user_id', OWNER)
    .in('id', [signalId1, signalId2]);
  
  console.log('\n=== SIGNAL ENTITY DETAILS ===');
  for (const sig of sigEntities ?? []) {
    const entities = sig.extracted_entities as Array<{entity_id: string, role?: string}> | null;
    console.log(`Signal ${sig.id}: entities = ${JSON.stringify(entities?.map(e => e.entity_id))}`);
    
    if (entities && entities.length > 0) {
      const entityIds = entities.map(e => e.entity_id).filter(Boolean);
      const { data: ents } = await sb
        .from('tkg_entities')
        .select('id,name,primary_email')
        .in('id', entityIds);
      console.log('  resolved entities:', ents?.map(e => `${e.name} (${e.primary_email})`));
    }
  }
}

main().catch(console.error);
