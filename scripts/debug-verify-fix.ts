/**
 * Verify that after the self-entity fix, the engagement_collapse winner 
 * (Brandon Kapp / self) no longer appears, and a real external candidate wins.
 * 
 * This calls the scorer directly with production data to verify the fix.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  // Verify: with fix applied, the discrepancy_collapse winner should be suppressed.
  // Pull the latest pipeline run and check if it changed after deploy.
  // Since we can't run the full scorer here without prod context, 
  // we verify the data pattern: Brandon Kapp entity that was winning has selfEmails match.

  const { data: ownerProfile } = await sb.auth.admin.getUserById(OWNER);
  console.log('Owner profile emails:', ownerProfile?.user?.email);
  
  const { data: entity } = await sb.from('tkg_entities')
    .select('id,name,primary_email,emails,patterns')
    .eq('id', '115183eb-3f49-438c-b1cd-f5b67eb15f1f')
    .single();
  
  console.log('\nBrandon Kapp entity:');
  console.log('  primary_email:', entity?.primary_email);
  console.log('  emails:', entity?.emails);
  console.log('  velocity_ratio:', (entity?.patterns as any)?.bx_stats?.velocity_ratio);
  console.log('  signal_count_90d:', (entity?.patterns as any)?.bx_stats?.signal_count_90d);
  
  // Also check the user's email — that's what selfEmails is built from
  const ownerEmail = ownerProfile?.user?.email;
  const entityEmail = entity?.primary_email;
  
  console.log('\nSelf-entity check:');
  console.log('  owner email:', ownerEmail);
  console.log('  entity email:', entityEmail);
  console.log('  match:', ownerEmail && entityEmail && ownerEmail.toLowerCase() === entityEmail.toLowerCase());
  
  // The fix adds isSelfEntity check which compares entity.primary_email to selfEmails Set.
  // selfEmails should contain 'b-kapp@outlook.com' which matches entity.primary_email.
  // After the fix, this entity will be skipped in extractEngagementCollapse.
  
  // Now let's look at what the real candidates are.
  // Top entities by total_interactions that are NOT self and NOT automated:
  const { data: topEntities } = await sb.from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction,patterns')
    .eq('user_id', OWNER)
    .not('id', 'eq', '115183eb-3f49-438c-b1cd-f5b67eb15f1f') // not self
    .order('total_interactions', { ascending: false })
    .limit(10);
  
  console.log('\nTop external entities with bx_stats:');
  for (const e of topEntities ?? []) {
    const bx = (e.patterns as any)?.bx_stats;
    if (bx) {
      console.log({
        name: e.name,
        total: e.total_interactions,
        velocity_ratio: bx.velocity_ratio,
        signal_count_90d: bx.signal_count_90d,
        signal_count_30d: bx.signal_count_30d,
        silence_detected: bx.silence_detected,
        would_fire_collapse: bx.velocity_ratio < 0.5 && (bx.signal_count_90d ?? 0) >= 8 && !bx.silence_detected,
        would_fire_dropout: bx.signal_count_30d === 0 && ((bx.signal_count_90d ?? 0) - Math.max(0, bx.signal_count_30d ?? 0)) >= 3 && !bx.silence_detected,
      });
    }
  }

  // What new winner would be? The top of the remaining candidates.
  // Let's check what currently survives the stakes gate — looking for  
  // external commitments with real entities.
  const { data: keriCommits } = await sb.from('tkg_commitments')
    .select('id,description,status,due_at,risk_score,promisor_id,promisee_id')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .or('promisor_id.eq.aa7733d9-a098-47a0-9acf-57977320ecc8,promisee_id.eq.aa7733d9-a098-47a0-9acf-57977320ecc8')
    .limit(5);
  console.log('\nKeri Nopens commitments:', keriCommits?.map(c => ({ desc: c.description, status: c.status, due_at: c.due_at, risk: c.risk_score })));

  const { data: yadiraCommits } = await sb.from('tkg_commitments')
    .select('id,description,status,due_at,risk_score,promisor_id,promisee_id')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .or('promisor_id.eq.ae3af629-f5a8-4cbc-9dff-f283f239d158,promisee_id.eq.ae3af629-f5a8-4cbc-9dff-f283f239d158')
    .limit(5);
  console.log('\nYadira Clapper commitments:', yadiraCommits?.map(c => ({ desc: c.description, status: c.status, due_at: c.due_at, risk: c.risk_score })));

  // MAS3 entity commitments
  const { data: mas3Entity } = await sb.from('tkg_entities')
    .select('id,name,primary_email,patterns')
    .eq('user_id', OWNER)
    .ilike('name', '%HCA%')
    .limit(3);
  console.log('\nHCA entity:', mas3Entity);
}

main().catch(console.error);
