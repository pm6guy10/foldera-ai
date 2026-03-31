/**
 * Debug scorer: runs detectDiscrepancies against production data locally.
 * Usage: node scripts/debug-scorer.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

// Load env
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  // Load entities
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('id, name, last_interaction, total_interactions, patterns, trust_class')
    .eq('user_id', userId)
    .in('trust_class', ['trusted', 'unclassified'])
    .neq('name', 'self')
    .order('total_interactions', { ascending: false })
    .limit(30);

  console.log('=== ENTITIES ===');
  console.log(`Total: ${entities.length}`);
  const silentEntities = entities.filter(e => e.patterns?.bx_stats?.silence_detected === true);
  console.log(`Silent entities: ${silentEntities.length}`);
  for (const e of silentEntities) {
    console.log(`  ${e.name}: ti=${e.total_interactions}, s90d=${e.patterns?.bx_stats?.signal_count_90d}, last=${e.last_interaction}`);
  }

  // Load goals
  const { data: goals } = await supabase
    .from('tkg_goals')
    .select('goal_text, priority, goal_category, source')
    .eq('user_id', userId)
    .order('priority', { ascending: true })
    .limit(20);

  console.log(`\n=== GOALS ===`);
  console.log(`Total: ${goals.length}`);
  const p1p2 = goals.filter(g => g.priority <= 2);
  console.log(`P1/P2 goals: ${p1p2.length}`);
  for (const g of p1p2) {
    console.log(`  P${g.priority}: ${g.goal_text.slice(0, 80)}`);
  }

  // Load commitments
  const { data: commitments } = await supabase
    .from('tkg_commitments')
    .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, promisor_id, promisee_id, updated_at')
    .eq('user_id', userId)
    .in('status', ['active', 'at_risk'])
    .limit(150);

  console.log(`\n=== COMMITMENTS ===`);
  console.log(`Total: ${commitments.length}`);

  // Check which entities have silence_detected AND total_interactions >= 5
  console.log(`\n=== DECAY CANDIDATES ===`);
  const decayRange = entities.filter(e => {
    const bx = e.patterns?.bx_stats;
    if (bx?.silence_detected !== true) return false;
    if (e.total_interactions < 5 || e.total_interactions >= 15) return false;
    return true;
  });
  console.log(`Entities passing decay filter (silence + 5-14 interactions): ${decayRange.length}`);
  for (const e of decayRange) {
    console.log(`  ${e.name}: ti=${e.total_interactions}, s90d=${e.patterns?.bx_stats?.signal_count_90d}`);

    // Check admission gate
    const s90d = e.patterns?.bx_stats?.signal_count_90d ?? 0;
    const ti = e.total_interactions;
    const reasons = [];

    // Medical/service check
    const MEDICAL = [/\b(?:dr\.?|doctor|physician|dentist|therapist|counselor|clinic|hospital|medical|health\s+care|healthcare|urgent\s+care|pharmacy)\b/i];
    if (MEDICAL.some(p => p.test(e.name))) reasons.push('medical');

    // Office/org check
    const OFFICE = [/\b(?:department|team|division|group|committee|board|office|administration|hr|human\s+resources|talent\s+acquisition|it\s+support|helpdesk|help\s+desk)\b/i];
    if (OFFICE.some(p => p.test(e.name))) reasons.push('office');

    // Low signal density — UPDATED CHECK
    if (s90d < 2 && ti < 5) reasons.push('low_signal_density');

    // Mention inflation
    if (s90d > 0 && ti > s90d * 20) reasons.push('mention_inflation');

    console.log(`    Admission gate reasons: ${reasons.length === 0 ? 'PASSES' : reasons.join(', ')}`);
  }

  // Check drift candidates
  console.log(`\n=== DRIFT CANDIDATES ===`);
  for (const g of p1p2) {
    console.log(`  P${g.priority}: ${g.goal_text.slice(0, 80)}`);
  }

  // Check exposure candidates (commitments due within 7 days)
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const exposureCandidates = commitments.filter(c => {
    const due = c.due_at ?? c.implied_due_at;
    if (!due) return false;
    const dueMs = new Date(due).getTime();
    return dueMs > now && dueMs <= now + sevenDays;
  });
  console.log(`\n=== EXPOSURE CANDIDATES (due in 7 days) ===`);
  console.log(`Count: ${exposureCandidates.length}`);
  for (const c of exposureCandidates) {
    console.log(`  ${c.description.slice(0, 80)} | due: ${c.due_at ?? c.implied_due_at}`);
  }
}

main().catch(console.error);
