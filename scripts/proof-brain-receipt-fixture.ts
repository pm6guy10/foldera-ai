/**
 * Deterministic, zero-paid-API harness path for the owner/dev brain-receipt pipeline.
 *
 * Exercises the full scorer → validation → persistence path using a canonical stub
 * payload (buildVerificationStubPersistGeneratedPayload) instead of Anthropic calls.
 *
 * Requirements:
 *   - .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads real prod data)
 *   - No ANTHROPIC_API_KEY or ALLOW_PAID_LLM required
 *
 * Usage:
 *   npx tsx scripts/proof-brain-receipt-fixture.ts
 *
 * Flags used on runDailyGenerate:
 *   pipelineDryRun: true        → skips signal LLM extraction + insight scan
 *   verificationStubPersist: true → generator returns canonical stub (no Anthropic)
 *   verificationGoldenPathWriteDocument: true → reorders candidates to prefer write_document
 *   skipStaleGate / skipSpendCap / skipManualCallLimit / forceFreshRun → owner bypass
 *
 * Harness condition:
 *   A fresh tkg_actions row is persisted (pending_approval or do_nothing)
 *   and the script prints whether the deterministic stub path exercised the seam.
 *   This does NOT count as product proof.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { runDailyGenerate } = await import('../lib/cron/daily-brief-generate');
  const { OWNER_USER_ID } = await import('../lib/auth/constants');
  const { createServerClient } = await import('../lib/db/client');
  const { isVerificationStubProofResult } = await import('../lib/cron/duplicate-truth');

  console.log('[fixture] Starting deterministic proof run — no paid API calls.');
  console.log(`[fixture] OWNER_USER_ID: ${OWNER_USER_ID.slice(0, 8)}…`);

  const startedAt = new Date().toISOString();

  const result = await runDailyGenerate({
    userIds: [OWNER_USER_ID],
    // Stub flags — zero Anthropic:
    pipelineDryRun: true,
    verificationStubPersist: true,
    verificationGoldenPathWriteDocument: true,
    // Owner bypass flags:
    skipStaleGate: true,
    skipSpendCap: true,
    skipManualCallLimit: true,
    forceFreshRun: true,
    briefInvocationSource: 'dev_brain_receipt_verification',
  });

  const ownerResult = result.results.find((r) => r.userId === OWNER_USER_ID);

  console.log('\n[fixture] runDailyGenerate result:');
  console.log(JSON.stringify(ownerResult, null, 2));

  // Check what actually persisted in the DB
  const supabase = createServerClient();
  const { data: latestAction, error } = await supabase
    .from('tkg_actions')
    .select('id, generated_at, action_type, status, directive_text, reason, confidence')
    .eq('user_id', OWNER_USER_ID)
    .gte('generated_at', startedAt)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('\n[fixture] DB query error:', error.message);
    process.exit(1);
  }

  console.log('\n[fixture] Persisted action (since run started):');
  if (latestAction) {
    console.log(JSON.stringify(latestAction, null, 2));

    const persisted = latestAction.status === 'pending_approval';
    const doNothing = latestAction.action_type === 'do_nothing';
    const staleDateBlocked =
      typeof latestAction.reason === 'string' &&
      (latestAction.reason.includes('stale') || latestAction.reason.includes('past') || latestAction.reason.includes('stale_date'));

    console.log('\n[fixture] ── PROOF SUMMARY ──────────────────────────────────');
    console.log(`  paid_api_required : false (fixture mode)`);
    console.log(`  action_persisted  : true`);
    console.log(`  action_type       : ${latestAction.action_type}`);
    console.log(`  status            : ${latestAction.status}`);
    console.log(`  candidate_survived: ${persisted || !doNothing}`);
    console.log(`  stale_date_blocked: ${staleDateBlocked}`);
    console.log(`  action_id         : ${latestAction.id}`);
    console.log(`  product_proof     : false (verification stub harness)`);

    if (isVerificationStubProofResult(ownerResult)) {
      console.log('\n[fixture] RESULT: HARNESS PASS — deterministic stub persisted, but this is not product proof');
    } else if (persisted) {
      console.log('\n[fixture] RESULT: PERSISTED — non-stub pending_approval row written');
    } else if (staleDateBlocked) {
      console.log('\n[fixture] RESULT: EXACT BLOCKER — stale-date validation still blocking');
      console.log('  file: lib/cron/daily-brief-generate.ts or lib/briefing/generator.ts');
      console.log('  reason:', latestAction.reason?.slice(0, 200));
    } else {
      console.log('\n[fixture] RESULT: do_nothing persisted — scorer or gates dropped all candidates');
      console.log('  reason:', latestAction.reason?.slice(0, 200));
    }
  } else {
    console.log('  none — no row written since run started');
    console.log('\n[fixture] RESULT: EXACT BLOCKER — persistence itself failed');
    console.log('  Check ownerResult.code above for the upstream failure reason.');
  }
}

main().catch((e) => {
  console.error('[fixture] Fatal:', e);
  process.exit(1);
});
