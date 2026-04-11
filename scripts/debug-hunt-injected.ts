/**
 * Show exactly which hunt candidates are injected into the scoring pool,
 * and what the final winner is after all filters.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

process.env.ALLOW_PAID_LLM = 'false';

async function main() {
  const { scoreOpenLoops } = await import('../lib/briefing/scorer');
  const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  
  const result = await scoreOpenLoops(OWNER) as any;
  
  // The winner
  console.log('\n=== WINNER ===');
  const w = result.winner;
  if (w) {
    console.log('candidate_id:', w.candidate_id ?? w.id);
    console.log('type:', w.type);
    console.log('entityName:', w.entityName);
    console.log('entity_email:', w.entity_email ?? w.entityEmail ?? w.primaryEmail);
    console.log('action:', w.recommended_action ?? w.actionType);
    console.log('score:', w.score);
    console.log('urgency:', w.urgencyLabel ?? w.urgency_label);
    console.log('title:', (w.title ?? '').slice(0, 200));
    console.log('full winner keys:', Object.keys(w));
  } else {
    console.log('NO WINNER');
  }
  
  // All scored candidates
  console.log('\n=== ALL SCORED CANDIDATES (after injection) ===');
  const scored = result.scoredCandidates ?? result.scored ?? result.candidates ?? [];
  console.log('count:', scored.length);
  for (const c of scored) {
    const id = c.candidate_id ?? c.id ?? 'unknown';
    const entity = c.entityName ?? c.entity ?? 'unknown';
    const score = typeof c.score === 'number' ? c.score.toFixed(3) : c.score;
    const action = c.recommended_action ?? c.actionType ?? 'unknown';
    const suppressed = c.suppressed ?? c.is_suppressed ?? false;
    const title = (c.title ?? '').slice(0, 80);
    const type = c.type ?? 'unknown';
    console.log(`  [${score}] ${type} | ${entity} | ${action} | supp=${suppressed}`);
    console.log(`    id: ${id}`);
    console.log(`    title: ${title}`);
  }
  
  // Also check result keys
  console.log('\n=== RESULT KEYS ===');
  console.log(Object.keys(result));
}

main().catch(console.error);
