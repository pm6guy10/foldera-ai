/**
 * Audit the right-now selection pool: are the ranking signals real, and is the
 * candidate pool fresh? Run this after a Microsoft/Google backfill to decide
 * whether #249 (scoring) is well-posed or whether the pool is still stale.
 *
 * Established baseline (2026-06-11, owner pool):
 *   - risk_score: 108 scorable rows, all 0 (1 distinct value) — ranking spine dead
 *   - due_confidence: all 0.5 (1 distinct value) — never computed
 *   - due_at: 51/108 have a date, ALL in the past (Dec 22 2025 -> Jun 11 2026)
 *   - future-dated commitments: 0 ; due in next 7d: 0
 *   - recency winner (what fires now): "$15 OneKeyCash gift before expiration"
 *
 * The fork this script settles:
 *   - future_due > 0 after backfill  => #249 is real: compute risk_score/due_confidence
 *   - future_due still 0             => upstream lifecycle bug (commitments never expire);
 *                                       that jumps the queue ahead of #249.
 *
 * Usage: node scripts/audit-selection-pool.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Brandon (owner). Same scope the scorer uses in scoreOpenLoops().
const userId = process.env.AUDIT_USER_ID || '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f';

async function main() {
  const { data: pool, error } = await supabase
    .from('tkg_commitments')
    .select('description, risk_score, due_confidence, due_at, implied_due_at, updated_at')
    .eq('user_id', userId)
    .in('trust_class', ['trusted', 'unclassified'])
    .in('status', ['active', 'at_risk'])
    .is('suppressed_at', null);

  if (error) {
    console.error('query failed:', error.message);
    process.exit(1);
  }

  const now = Date.now();
  const total = pool.length;
  const riskVals = new Set(pool.map((c) => c.risk_score ?? 0));
  const dcVals = new Set(pool.map((c) => c.due_confidence ?? null));
  const withDue = pool.filter((c) => c.due_at);
  const pastDue = withDue.filter((c) => new Date(c.due_at).getTime() < now);
  const futureDue = withDue.filter((c) => new Date(c.due_at).getTime() >= now);
  const next7d = futureDue.filter(
    (c) => new Date(c.due_at).getTime() < now + 7 * 864e5,
  );

  const recencyWinner = [...pool].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
  )[0];
  const dueWinner = [...futureDue].sort(
    (a, b) => new Date(a.due_at) - new Date(b.due_at),
  )[0];

  console.log('=== SELECTION POOL AUDIT ===', new Date().toISOString());
  console.log(`scorable pool (active/at_risk, trusted, unsuppressed): ${total}`);
  console.log(`risk_score distinct values:    ${[...riskVals].join(', ')}  ${riskVals.size === 1 ? '⚠ FLAT — ranking spine dead' : 'OK'}`);
  console.log(`due_confidence distinct values: ${[...dcVals].join(', ')}  ${dcVals.size === 1 ? '⚠ FLAT — never computed' : 'OK'}`);
  console.log(`due_at: ${withDue.length} have a date | past=${pastDue.length} future=${futureDue.length} next7d=${next7d.length}`);
  console.log('');
  console.log('FIRES NOW (recency winner):', recencyWinner ? `"${recencyWinner.description?.slice(0, 90)}" due_at=${recencyWinner.due_at}` : '(none)');
  console.log('SHOULD FIRE (soonest future deadline):', dueWinner ? `"${dueWinner.description?.slice(0, 90)}" due_at=${dueWinner.due_at}` : '(NONE — no future-dated commitment exists)');
  console.log('');
  if (futureDue.length === 0) {
    console.log('VERDICT: pool is STALE — zero future deadlines. Upstream lifecycle/extraction issue jumps ahead of #249 scoring.');
  } else if (riskVals.size === 1) {
    console.log('VERDICT: pool is FRESH but scoring is unbuilt. #249 is well-posed: compute risk_score/due_confidence from the signals already present.');
  } else {
    console.log('VERDICT: pool fresh and scoring live. Selection should be trustworthy — verify the winner by hand.');
  }
}

main();
