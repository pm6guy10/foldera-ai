/**
 * Show which unreplied inbound signals actually involve REAL humans
 * (as evidenced by their entity being in tkg_entities with trust_class=trusted)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

// Target signal IDs from the hunt winner
const HUNT_WINNER_SIGNAL = '16cbbc4f-d82e-4eb3-a63e-502ff25571ed';

async function main() {
  // Check the hunt winner signal
  const { data: winnerSig } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author,content,extracted_entities')
    .eq('id', HUNT_WINNER_SIGNAL)
    .single();
  
  console.log('=== HUNT WINNER SIGNAL ===');
  if (winnerSig) {
    const content = winnerSig.content as Record<string, unknown>;
    console.log('occurred_at:', winnerSig.occurred_at);
    console.log('author:', winnerSig.author);
    console.log('subject:', content?.subject ?? '(encrypted/no subject field)');
    console.log('from:', content?.from ?? '(encrypted)');
    console.log('source:', winnerSig.source);
    // Show raw content snippet
    const rawContent = typeof winnerSig.content === 'string' 
      ? winnerSig.content.slice(0, 400) 
      : JSON.stringify(winnerSig.content).slice(0, 400);
    console.log('raw_content_snippet:', rawContent);
  }

  // Look at all trusted entities with their last interaction to understand who could be a real hunt candidate
  const { data: trustedEntities } = await sb.from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction,trust_class')
    .eq('user_id', OWNER)
    .eq('trust_class', 'trusted')
    .not('primary_email', 'is', null)
    .order('last_interaction', { ascending: true })
    .limit(20);
  
  console.log('\n=== TRUSTED ENTITIES (oldest interaction first) ===');
  const now = Date.now();
  for (const e of trustedEntities ?? []) {
    const lastMs = e.last_interaction ? new Date(e.last_interaction).getTime() : 0;
    const daysAgo = Math.round((now - lastMs) / 86400000);
    console.log(`  ${daysAgo}d ago | ${e.name} | ${e.primary_email} | interactions=${e.total_interactions}`);
  }
  
  // Check signals from trusted humans that arrived inbound
  console.log('\n=== RECENT INBOUND SIGNALS FROM TRUSTED HUMANS ===');
  const trustedEmails = (trustedEntities ?? [])
    .filter(e => e.primary_email && !e.primary_email.includes('foldera'))
    .map(e => e.primary_email as string)
    .slice(0, 10);
  
  console.log('Checking emails:', trustedEmails);
  
  // Check for recent signals from these trusted humans that are inbound
  const { data: recentSignals } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author')
    .eq('user_id', OWNER)
    .eq('type', 'email_received')
    .in('author', trustedEmails)
    .order('occurred_at', { ascending: false })
    .limit(20);
  
  for (const s of recentSignals ?? []) {
    console.log(`  ${s.occurred_at?.slice(0,10)} | author=${s.author} | source=${s.source}`);
  }
  
  // Also check: do we have any entity with an active DSHS/HCA/state-gov thread?
  console.log('\n=== STATE GOV ENTITIES ===');
  const stateGovEmails = ['keri.nopens@dshs.wa.gov', 'yadira.clapper@hca.wa.gov', 'cheryl.anderson1@dshs.wa.gov', 'caleb.gieger@atg.wa.gov', 'jim.dunivan@dnr.wa.gov', 'shiloh.t.kinney@outlook.com'];
  const { data: stateGovSignals } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author')
    .eq('user_id', OWNER)
    .in('type', ['email_received', 'email_sent'])
    .in('author', stateGovEmails)
    .order('occurred_at', { ascending: false })
    .limit(20);
  
  console.log('State gov signals (recent):');
  for (const s of stateGovSignals ?? []) {
    console.log(`  ${s.occurred_at?.slice(0,10)} | ${s.type} | author=${s.author}`);
  }
}

main().catch(console.error);
