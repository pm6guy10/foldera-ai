/**
 * Check if Yadira's email is being picked up by the hunt as unreplied inbound.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const YADIRA_EMAIL = 'yadira.clapper@hca.wa.gov';
const KERI_EMAIL = 'keri.nopens@dshs.wa.gov';
const CHERYL_EMAIL = 'cheryl.anderson1@dshs.wa.gov';

async function main() {
  // Get signals authored by these real humans
  const { data: signals } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author,processed')
    .eq('user_id', OWNER)
    .in('author', [YADIRA_EMAIL, KERI_EMAIL, CHERYL_EMAIL])
    .order('occurred_at', { ascending: false })
    .limit(20);
  
  console.log('=== SIGNALS FROM YADIRA/KERI/CHERYL ===');
  console.log('count:', signals?.length ?? 0);
  for (const s of signals ?? []) {
    console.log({
      id: s.id,
      occurred_at: s.occurred_at?.slice(0, 16),
      type: s.type,
      author: s.author,
      source: s.source,
      processed: s.processed,
    });
  }
  
  // Check if there are ANY sent emails to yadira after March 18 (her last email)
  const { data: sentAfterYadira } = await sb.from('tkg_signals')
    .select('id,occurred_at,author,type')
    .eq('user_id', OWNER)
    .eq('type', 'email_sent')
    .gte('occurred_at', '2026-03-18T00:00:00Z')
    .order('occurred_at', { ascending: false })
    .limit(20);
  
  console.log('\n=== SENT EMAILS AFTER MARCH 18 (to check if Yadira was replied to) ===');
  console.log('count:', sentAfterYadira?.length ?? 0);
  for (const s of sentAfterYadira ?? []) {
    console.log({ id: s.id, occurred_at: s.occurred_at?.slice(0, 16), author: s.author, type: s.type });
  }
  
  // Check Yadira entity
  const { data: yadiraEntity } = await sb.from('tkg_entities')
    .select('id,name,primary_email,trust_class,last_interaction,total_interactions,patterns')
    .eq('user_id', OWNER)
    .ilike('name', '%yadira%')
    .single();
  
  console.log('\n=== YADIRA ENTITY ===');
  console.log(JSON.stringify(yadiraEntity, null, 2));
  
  // Check for Cheryl signals (very old - 88 days)
  const { data: cherylSignals } = await sb.from('tkg_signals')
    .select('id,occurred_at,author,type')
    .eq('user_id', OWNER)
    .eq('author', CHERYL_EMAIL)
    .order('occurred_at', { ascending: false })
    .limit(5);
  console.log('\n=== CHERYL SIGNALS ===');
  for (const s of cherylSignals ?? []) {
    console.log({ id: s.id, occurred_at: s.occurred_at?.slice(0,16), type: s.type });
  }
}

main().catch(console.error);
