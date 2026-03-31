/**
 * Debug: run detectDiscrepancies locally against production data.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  const [
    { data: entities },
    { data: goals },
    { data: commitments },
    { data: signals },
  ] = await Promise.all([
    supabase
      .from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns, trust_class')
      .eq('user_id', userId)
      .in('trust_class', ['trusted', 'unclassified'])
      .neq('name', 'self')
      .order('total_interactions', { ascending: false })
      .limit(30),
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(20),
    supabase
      .from('tkg_commitments')
      .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, promisor_id, promisee_id, updated_at')
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk'])
      .limit(150),
    supabase
      .from('tkg_signals')
      .select('id, content, source, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .order('occurred_at', { ascending: false })
      .limit(200),
  ]);

  // We can't import the TS module directly, so let's manually check what discrepancies would fire
  const now = Date.now();

  console.log('=== DECAY CHECK ===');
  const MEDICAL = [/\b(?:dr\.?|doctor|physician|dentist|therapist|counselor|clinic|hospital|medical|health\s+care|healthcare|urgent\s+care|pharmacy)\b/i];
  const OFFICE = [/\b(?:department|team|division|group|committee|board|office|administration|hr|human\s+resources|talent\s+acquisition|it\s+support|helpdesk|help\s+desk)\b/i];

  for (const e of entities) {
    const bx = e.patterns?.bx_stats;
    if (bx?.silence_detected !== true) continue;
    if (e.total_interactions < 5 || e.total_interactions >= 15) continue;

    // Admission gate
    const reasons = [];
    if (MEDICAL.some(p => p.test(e.name))) reasons.push('medical');
    if (OFFICE.some(p => p.test(e.name))) reasons.push('office');
    const s90d = bx?.signal_count_90d ?? 0;
    if (s90d < 2 && e.total_interactions < 5) reasons.push('low_signal_density');
    if (s90d > 0 && e.total_interactions > s90d * 20) reasons.push('mention_inflation');

    // Goal linkage check (gate F)
    const firstName = e.name.split(/\s+/)[0];
    // Would need decrypted signals here — skip for now

    console.log(`  ${e.name}: ti=${e.total_interactions}, s90d=${s90d}, admission=${reasons.length === 0 ? 'PASS' : reasons.join(',')}`);
  }

  console.log('\n=== DRIFT CHECK ===');
  const p1p2Goals = goals.filter(g => g.priority <= 2);
  // Decrypt signals to check keyword matches (simplified)
  console.log(`P1/P2 goals: ${p1p2Goals.length}`);
  for (const g of p1p2Goals) {
    // Skip suppression/DO NOT goals
    if (g.goal_text.startsWith('DO NOT')) {
      console.log(`  SKIP (suppression): ${g.goal_text.slice(0, 80)}`);
      continue;
    }
    if (g.goal_text === '__ONBOARDING_COMPLETE__') {
      console.log(`  SKIP (placeholder): ${g.goal_text}`);
      continue;
    }
    console.log(`  CHECK DRIFT: P${g.priority}: ${g.goal_text.slice(0, 80)}`);
  }

  console.log('\n=== EXPOSURE CHECK ===');
  const sevenDays = 7 * 86400000;
  const upcoming = commitments.filter(c => {
    const due = c.due_at ?? c.implied_due_at;
    if (!due) return false;
    const dueMs = new Date(due).getTime();
    return dueMs > now && dueMs <= now + sevenDays;
  });
  console.log(`Commitments due in 7 days: ${upcoming.length}`);
  for (const c of upcoming) {
    console.log(`  ${c.description.slice(0, 80)} | due: ${c.due_at ?? c.implied_due_at} | cat: ${c.category}`);
  }

  console.log('\n=== AVOIDANCE CHECK ===');
  const fourteenDays = 14 * 86400000;
  const stalled = commitments.filter(c => {
    if (c.status !== 'at_risk') return false;
    if (!c.updated_at) return false;
    return (now - new Date(c.updated_at).getTime()) > fourteenDays;
  });
  console.log(`At-risk commitments stalled 14+ days: ${stalled.length}`);
  for (const c of stalled.slice(0, 5)) {
    console.log(`  ${c.description.slice(0, 80)} | updated: ${c.updated_at}`);
  }

  // Check goal filtering in scorer
  console.log('\n=== GOAL FILTER CHECK ===');
  const filtered = goals.filter(g => {
    if (g.goal_text === '__ONBOARDING_COMPLETE__') return false;
    if (/^Inferred from behavior:/.test(g.goal_text)) return false;
    if (g.source === 'auto_suppression') return false;
    return true;
  });
  console.log(`Goals after filtering: ${filtered.length} (from ${goals.length})`);
}

main().catch(console.error);
