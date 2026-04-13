/**
 * Owner golden path (no paid LLM): same options as POST /api/dev/brain-receipt with
 * verification_stub_persist — for local/operator verification without browser session.
 *
 * Usage: npx tsx scripts/run-verification-golden-path-once.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { runDailyGenerate } = await import('../lib/cron/daily-brief-generate');
  const { OWNER_USER_ID } = await import('../lib/auth/constants');

  const result = await runDailyGenerate({
    userIds: [OWNER_USER_ID],
    skipStaleGate: true,
    skipSpendCap: true,
    skipManualCallLimit: true,
    forceFreshRun: true,
    briefInvocationSource: 'dev_brain_receipt_verification',
    verificationStubPersist: true,
  });

  console.log(JSON.stringify(result, null, 2));
  const row = result.results?.find((r) => r.userId === OWNER_USER_ID);
  const code = row?.code;
  if (code !== 'pending_approval_persisted') {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
