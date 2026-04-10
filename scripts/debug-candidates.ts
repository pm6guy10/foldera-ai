import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  // Look at recent signals from real people (email, not calendar, not self-generated)
  const { data: realSigs } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author,recipients,extracted_entities,extracted_commitments,content')
    .eq('user_id', OWNER)
    .in('source', ['outlook', 'gmail'])
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(20);

  console.log('\n=== RECENT REAL EMAIL SIGNALS ===');
  for (const s of realSigs ?? []) {
    const content = s.content as any;
    const author = s.author as any;
    const entities = s.extracted_entities as any[];
    const commitments = s.extracted_commitments as any[];
    console.log({
      id: s.id,
      source: s.source,
      occurred_at: s.occurred_at,
      subject: content?.subject?.slice(0, 80),
      from: typeof author === 'string' ? author : (author?.email ?? author?.name),
      entity_count: entities?.length ?? 0,
      commitment_count: commitments?.length ?? 0,
    });
  }

  // Active commitments from real external sources
  const { data: activeComs } = await sb.from('tkg_commitments')
    .select('id,description,canonical_form,status,due_at,implied_due_at,risk_score,source,source_id,promisor_id,promisee_id,created_at,category')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);

  console.log('\n=== ALL ACTIVE NON-SUPPRESSED COMMITMENTS ===');
  for (const c of activeComs ?? []) {
    console.log({
      id: c.id,
      desc: c.description?.slice(0, 100),
      status: c.status,
      due_at: c.due_at ?? c.implied_due_at,
      risk: c.risk_score,
      category: c.category,
      source: c.source,
      promisor: c.promisor_id,
      promisee: c.promisee_id,
    });
  }

  // Non-self entities with strong interactions
  const { data: extEntities } = await sb.from('tkg_entities')
    .select('id,name,display_name,type,company,role,primary_email,relationship_strength,last_interaction,total_interactions')
    .eq('user_id', OWNER)
    .not('name', 'ilike', 'brandon%')
    .not('name', 'ilike', '%foldera%')
    .order('total_interactions', { ascending: false })
    .limit(20);

  console.log('\n=== TOP EXTERNAL ENTITIES ===');
  for (const e of extEntities ?? []) {
    console.log({
      id: e.id,
      name: e.name,
      company: e.company,
      role: e.role,
      email: e.primary_email,
      strength: e.relationship_strength,
      last: e.last_interaction,
      total: e.total_interactions,
    });
  }

  // Look at commitments for top non-self entities
  const topEntityIds = extEntities?.slice(0, 5).map(e => e.id) ?? [];
  if (topEntityIds.length > 0) {
    const { data: topComms } = await sb.from('tkg_commitments')
      .select('id,description,status,due_at,implied_due_at,risk_score,promisor_id,promisee_id,source_id')
      .eq('user_id', OWNER)
      .is('suppressed_at', null)
      .or(topEntityIds.map(id => `promisor_id.eq.${id},promisee_id.eq.${id}`).join(','))
      .limit(20);
    
    console.log('\n=== COMMITMENTS FOR TOP EXTERNAL ENTITIES ===');
    for (const c of topComms ?? []) {
      const entity = extEntities?.find(e => e.id === c.promisor_id || e.id === c.promisee_id);
      console.log({
        entity: entity?.name,
        desc: c.description?.slice(0, 100),
        status: c.status,
        due_at: c.due_at ?? c.implied_due_at,
        risk: c.risk_score,
      });
    }
  }

  // Look at the HRSN commitment - that had a due date
  const { data: hrsn } = await sb.from('tkg_commitments')
    .select('*')
    .eq('user_id', OWNER)
    .ilike('description', '%HRSN%')
    .limit(5);
  console.log('\n=== HRSN COMMITMENTS ===', hrsn?.map(c => ({ desc: c.description, status: c.status, due_at: c.due_at, suppressed: !!c.suppressed_at, promisor: c.promisor_id, promisee: c.promisee_id })));

  // MAS3 job offer  
  const { data: mas3 } = await sb.from('tkg_commitments')
    .select('*')
    .eq('user_id', OWNER)
    .ilike('description', '%MAS3%')
    .limit(5);
  console.log('\n=== MAS3 COMMITMENTS ===', mas3?.map(c => ({ desc: c.description, status: c.status, due_at: c.due_at, suppressed: !!c.suppressed_at, promisor: c.promisor_id, promisee: c.promisee_id })));

  // Ramy mention
  const { data: ramy } = await sb.from('tkg_commitments')
    .select('*')
    .eq('user_id', OWNER)
    .ilike('description', '%ramy%')
    .limit(5);
  console.log('\n=== RAMY COMMITMENTS ===', ramy?.map(c => ({ desc: c.description, status: c.status, due_at: c.due_at, suppressed: !!c.suppressed_at })));
}

main().catch(console.error);
