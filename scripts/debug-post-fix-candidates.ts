import { OWNER_USER_ID } from '../lib/auth/constants';
/**
 * Run the scorer locally against production DB to see post-fix candidates.
 * This exercises the exact same code path as a real pipeline run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Force the environment so scorer works locally
process.env.ALLOW_PAID_LLM = 'false';

async function main() {
  const { scoreOpenLoops } = await import('../lib/briefing/scorer');
  
  const OWNER = OWNER_USER_ID;
  
  console.log('Running scoreOpenLoops for owner...');
  const result = await scoreOpenLoops(OWNER);
  
  console.log('\n=== SCORER RESULT ===');
  console.log('winner type:', result.winner?.type);
  console.log('winner entity:', result.winner?.entityName);
  console.log('winner candidate_id:', (result.winner as { candidate_id?: string } | null)?.candidate_id);
  console.log('winner score:', result.winner ? (result.winner as any).score : null);
  console.log('winner scorer_ev:', (result as any).scorer_ev);
  
  // Show top 10 scored candidates
  const scored = (result as any).scored_candidates || (result as any).scored || [];
  console.log('\n=== TOP SCORED CANDIDATES ===');
  console.log('total candidates:', scored.length);
  for (const c of scored.slice(0, 15)) {
    console.log({
      candidate_id: c.candidate_id,
      type: c.type,
      entity: c.entityName,
      score: c.score?.toFixed(3),
      action: c.recommended_action,
      urgency_label: c.urgencyLabel,
    });
  }
  
  // Show gate funnel
  const funnel = (result as any).gate_funnel;
  if (funnel) {
    console.log('\n=== GATE FUNNEL ===');
    console.log(JSON.stringify(funnel, null, 2));
  }
}

main().catch(console.error);
