import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Import the decrypt function
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Get all processed signals from last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals, error } = await supabase
    .from('tkg_signals')
    .select('id, type, source, occurred_at, processed, content')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', ninetyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (error) { console.error(error); return; }
  
  console.log(`Total processed signals in 90d window: ${signals?.length ?? 0}`);
  
  // Check which signals mention "keri"
  // We need to decrypt
  const { decryptWithStatus } = await import('../lib/encryption.js');
  
  let keriSignals = 0;
  let keriWithOutcomeEvidence = 0;
  
  for (const s of (signals ?? [])) {
    try {
      const result = decryptWithStatus(s.content);
      const content = result.plaintext;
      const lower = content.toLowerCase();
      if (lower.includes('keri') || lower.includes('nopens')) {
        keriSignals++;
        const hasOutcome = /\b(?:offer|hiring|hired|interview|approval|approved|contract|deal|partnership|opportunity|deadline|due\s+date|follow\s+up|next\s+steps?|proposal)\b/i.test(content);
        if (hasOutcome) keriWithOutcomeEvidence++;
        console.log(`\n--- Keri signal (${s.occurred_at?.slice(0,10)}) ---`);
        console.log('hasOutcomeEvidence:', hasOutcome);
        console.log(content.slice(0, 300));
      }
    } catch (e) {
      // skip decrypt errors
    }
  }
  
  console.log(`\nKeri-mentioning signals: ${keriSignals}`);
  console.log(`Keri signals with outcome evidence: ${keriWithOutcomeEvidence}`);
  
  // If keriSignals > 0 && keriWithOutcomeEvidence == 0, gate F kills the candidate
  
  // Now count total processed signals in 90d window (for context)
  const { count } = await supabase
    .from('tkg_signals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', ninetyDaysAgo);
  console.log(`\nTotal processed signals in 90d: ${count}`);
  
  // Check unprocessed count
  const { count: unprocessed } = await supabase
    .from('tkg_signals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', false);
  console.log(`Unprocessed signals: ${unprocessed}`);
}

main().catch(console.error);
