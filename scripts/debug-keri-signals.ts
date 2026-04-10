import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
dotenv.config({ path: '.env.local' });

function decryptContent(encryptedContent: string): string {
  try {
    const key = process.env.ENCRYPTION_KEY!;
    const parts = encryptedContent.split(':');
    if (parts.length !== 2) return '[not encrypted]';
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const keyBuf = Buffer.from(key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return `[decrypt error: ${e}]`;
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  // Get all 90d signals
  const { data: allSignals } = await supabase
    .from('tkg_signals')
    .select('id, content, source, type, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', ninetyDaysAgo)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(200);

  const decrypted = (allSignals ?? []).map(s => {
    const text = decryptContent(s.content as string);
    return { ...s, text };
  });

  // Find signals mentioning keri
  const keriSignals = decrypted.filter(s => /\bkeri\b/i.test(s.text));
  console.log(`\n=== SIGNALS MENTIONING KERI IN 90d WINDOW (${keriSignals.length}) ===`);
  for (const s of keriSignals) {
    console.log(`\n  [${s.occurred_at?.toString().slice(0,10)}] ${s.source} | ${s.type}`);
    console.log(`  ${s.text.slice(0, 400)}`);
  }

  // OUTCOME patterns from discrepancy-detector
  const OUTCOME_PATTERNS = [
    /\b(?:offer|hiring|hired|interview|approval|approved|contract|deal|partnership|opportunity)\b/i,
    /\b(?:\$|budget|cash|runway|invoice|payment|revenue|funding|raise|investment|client)\b/i,
    /\b(?:recruiter|hiring\s+manager|vp|cto|ceo|director|founder|partner|stakeholder|decision\s+maker)\b/i,
    /\b(?:deadline|due\s+date|by\s+(?:monday|tuesday|wednesday|thursday|friday|eod|end\s+of\s+week))\b/i,
    /\b(?:follow\s+up|next\s+steps?|proposal|scope|statement\s+of\s+work|sow|nda|term\s+sheet)\b/i,
  ];

  if (keriSignals.length > 0) {
    const anyOutcome = keriSignals.some(s => OUTCOME_PATTERNS.some(p => p.test(s.text)));
    console.log(`\n=== ENTITY GATE RESULT ===`);
    console.log(`has_outcome_keywords=${anyOutcome}`);
    if (!anyOutcome) {
      console.log('❌ BLOCKED by no_goal_linkage — keri signals have no outcome keywords');
      console.log('   This prevents decay_keri from being generated as a discrepancy candidate');
    } else {
      console.log('✅ Passes goal_linkage check');
    }
  } else {
    console.log('\nNo 90d signals mention keri — no_goal_linkage gate does NOT fire for keri');
    console.log('Check other rejection reasons instead');
  }

  // Also check cheryl
  const cherylSignals = decrypted.filter(s => /\bcheryl\b/i.test(s.text));
  console.log(`\n=== SIGNALS MENTIONING CHERYL IN 90d WINDOW (${cherylSignals.length}) ===`);
  for (const s of cherylSignals.slice(0, 3)) {
    const hasOutcome = OUTCOME_PATTERNS.some(p => p.test(s.text));
    console.log(`  [${s.occurred_at?.toString().slice(0,10)}] ${s.source} | outcome=${hasOutcome} | ${s.text.slice(0, 200)}`);
  }

  // Total signal count  
  console.log(`\nTotal 90d signals: ${decrypted.length}`);
  console.log(`Total keri mentions: ${keriSignals.length}`);
  console.log(`Total cheryl mentions: ${cherylSignals.length}`);
}

main().catch(console.error);
