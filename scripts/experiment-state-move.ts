/**
 * EXPERIMENT RUNNER (#567 paradigm test) — no-goals vs. goal-engine, head-to-head.
 *
 *   npx tsx scripts/experiment-state-move.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (live pool) and, for Arm A's one LLM call, ANTHROPIC_API_KEY + ALLOW_PAID_LLM=true
 * (paid LLM is already ON in prod; this is the owner-proof path locally).
 *
 * READ-ONLY: Arm A SELECTs signals/commitments; Arm B SELECTs the engine's actual
 * recent output from `pipeline_runs` + the top candidate it would serve. Neither
 * arm calls `deliverWorkdayPresence` (which mutates) and neither touches `tkg_goals`.
 */
import * as dotenv from 'dotenv';
import { createServerClient } from '@/lib/db/client';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { runStateMove, STABLE_OBJECTIVE } from '@/lib/experimental/state-move';

dotenv.config({ path: '.env.local' });

async function main() {
  const userId = process.env.FOLDERA_SELF_USER_ID?.trim() ?? OWNER_USER_ID;
  const supabase = createServerClient();

  // ---- Arm B: the goal-engine's ACTUAL recent output (read-only) ----------
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('created_at, outcome, blocked_gate, winner_action_type, candidates_evaluated')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: topCandidate } = await supabase
    .from('tkg_commitments')
    .select('description, category, risk_score, due_at, implied_due_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('suppressed_at', null)
    .order('risk_score', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // ---- Arm A: no-goals decisive move (one LLM call, no tkg_goals) ----------
  const armA = await runStateMove({ userId, supabase });

  // ---- Side-by-side ------------------------------------------------------
  const lastOutcome = runs?.[0]?.outcome ?? 'unknown';
  const allSilent = (runs ?? []).length > 0 && (runs ?? []).every((r) => r.outcome === 'safe_silence');

  console.log('\n================  HEAD-TO-HEAD: no-goals vs goal-engine  ================');
  console.log(`owner=${userId}`);
  console.log(`objective="${STABLE_OBJECTIVE}"`);
  console.log(`evidence: ${armA.evidence_counts.signals} signals / ${armA.evidence_counts.commitments} open commitments\n`);

  console.log('---- ARM B: goal-engine (stored tkg_goals -> scorer) ----');
  console.log(`last ${runs?.length ?? 0} pipeline_runs outcomes: ${(runs ?? []).map((r) => r.outcome).join(', ') || '(none)'}`);
  console.log(`when it fires, it would serve the #1 risk-ranked candidate:`);
  console.log(
    topCandidate
      ? `  -> (risk ${topCandidate.risk_score}, ${topCandidate.category}) ${topCandidate.description}`
      : '  -> (pool empty)',
  );

  console.log('\n---- ARM A: no-goals (stable objective + live evidence) ----');
  if (armA.move) {
    console.log(`  one_move:     ${armA.move.one_move}`);
    console.log(`  why:          ${armA.move.why_one_line}`);
    console.log(`  what_changed: ${armA.move.what_changed}`);
  } else {
    console.log(`  (no move) error: ${armA.error}`);
  }

  // ---- Verdict -----------------------------------------------------------
  let verdict = 'inconclusive';
  if (armA.move && (allSilent || lastOutcome === 'safe_silence')) {
    verdict = 'no-goals'; // engine said nothing; no-goals produced a move
  } else if (armA.move) {
    verdict = 'compare-above'; // both produced something — judge decisiveness/objective-fit by eye
  } else {
    verdict = 'goal-engine'; // no-goals failed to produce a move
  }
  console.log(`\nVERDICT: ${verdict}`);
  console.log('(engine produced %s; no-goals produced %s)', lastOutcome, armA.move ? 'a move' : 'nothing');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
