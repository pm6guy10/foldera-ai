import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { decrypt } from '../lib/auth/encryption';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  const signalId1 = '08b906c3-3e54-4981-b541-1ad868bfd43e';
  const signalId2 = '5b851583-cc47-4c89-9ca5-9accd2d36b29';

  const { data: signals } = await sb
    .from('tkg_signals')
    .select('id,source,type,occurred_at,author,content_encrypted,content')
    .eq('user_id', OWNER)
    .in('id', [signalId1, signalId2]);

  for (const s of signals ?? []) {
    console.log(`\n=== Signal ${s.id} ===`);
    console.log('source:', s.source);
    console.log('type:', s.type);
    console.log('occurred_at:', s.occurred_at);
    console.log('author:', s.author);
    
    // Try to decrypt
    let decrypted = '';
    try {
      if (s.content_encrypted) {
        decrypted = await decrypt(s.content_encrypted as string);
      } else if (s.content) {
        decrypted = typeof s.content === 'string' ? s.content : JSON.stringify(s.content);
      }
    } catch (e) {
      decrypted = '(decryption failed)';
    }
    
    // Show first 500 chars
    console.log('content preview:', decrypted.slice(0, 500));
    
    // Check From line
    const fromMatch = decrypted.match(/(?:^|\n)From:\s*(.+)/i);
    console.log('From line:', fromMatch?.[1]);
  }
  
  // Also show the top hunt candidates from latest run 
  // by examining what hunt_unreplied_ signals looked like
  const { data: recentSignals } = await sb
    .from('tkg_signals')
    .select('id,source,type,occurred_at,author')
    .eq('user_id', OWNER)
    .eq('type', 'email_received')
    .gte('occurred_at', '2026-03-20T00:00:00Z')
    .order('occurred_at', { ascending: false })
    .limit(20);

  console.log('\n=== Recent received emails (no decryption) ===');
  for (const s of recentSignals ?? []) {
    console.log(`  ${s.occurred_at?.slice(0,16)} | ${s.id} | author=${s.author}`);
  }
}

main().catch(console.error);
