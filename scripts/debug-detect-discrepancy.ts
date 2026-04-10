import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
dotenv.config({ path: '.env.local' });

import { detectDiscrepancies, getEntityRejectionReasons } from '../lib/briefing/discrepancy-detector';

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
  } catch {
    return '';
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  // Fetch data exactly as scorer does
  const [entitiesRes, goalsRes, signalsRes] = await Promise.all([
    supabase
      .from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns, trust_class, primary_email, emails')
      .eq('user_id', userId)
      .in('trust_class', ['trusted', 'unclassified'])
      .neq('name', 'self')
      .order('total_interactions', { ascending: false })
      .limit(30),
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .limit(20),
    supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', ninetyDaysAgo)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(150),
  ]);

  const entities = entitiesRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const allSignals = signalsRes.data ?? [];
  const decryptedSignals = allSignals
    .map(s => decryptContent(s.content as string))
    .filter(s => s.length > 0);

  console.log(`entities: ${entities.length}, goals: ${goals.length}, signals: ${decryptedSignals.length}`);
  
  // Show silent entities
  const silentEntities = entities.filter(e => {
    const bx = (e.patterns as any)?.bx_stats;
    return bx?.silence_detected === true;
  });
  console.log(`\nSilent entities (silence_detected=true): ${silentEntities.length}`);
  for (const e of silentEntities) {
    const bx = (e.patterns as any)?.bx_stats;
    const rejections = getEntityRejectionReasons(
      e as Parameters<typeof getEntityRejectionReasons>[0],
      goals as Parameters<typeof getEntityRejectionReasons>[1],
      decryptedSignals
    );
    console.log(`  ${e.name} (${e.primary_email ?? 'no email'}) | ti=${e.total_interactions} | 90d=${bx?.signal_count_90d} | rejections=${rejections.join(', ') || 'NONE'}`);
  }

  // Run the actual detectDiscrepancies
  const discrepancies = detectDiscrepancies({
    commitments: [],
    entities: entities as any[],
    goals: goals as any[],
    decryptedSignals,
    structuredSignals: [],
    recentDirectives: [],
    selfEmails: new Set(),
    selfNameTokens: undefined,
  });

  console.log(`\nTotal discrepancies detected: ${discrepancies.length}`);
  for (const d of discrepancies) {
    console.log(`  ${d.id} | class=${d.class} | entity=${d.entityName ?? 'none'} | stakes=${d.stakes} | action=${d.suggestedActionType}`);
  }
}

main().catch(console.error);
