/**
 * One-shot: same options as POST /api/dev/brain-receipt without verification_stub_persist
 * (real LLM write_document path). Requires .env.local with prod Supabase + model keys.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { runDailyGenerate } = await import('../lib/cron/daily-brief-generate');
  const { OWNER_USER_ID } = await import('../lib/auth/constants');
  const { assessProofOutcome } = await import('../lib/cron/duplicate-truth');

  const result = await runDailyGenerate({
    userIds: [OWNER_USER_ID],
    skipStaleGate: true,
    skipSpendCap: true,
    skipManualCallLimit: true,
    forceFreshRun: true,
    briefInvocationSource: 'dev_brain_receipt',
  });

  console.log(JSON.stringify(result, null, 2));
  const ownerRow = result.results?.find((row) => row.userId === OWNER_USER_ID);
  const assessment = assessProofOutcome(ownerRow);
  if (!assessment.accepted) {
    console.error(`Live-like proof rejected outcome: ${assessment.reason}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
