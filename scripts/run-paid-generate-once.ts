/**
 * Local one-shot: runDailyGenerate with ALLOW_PAID_LLM=true (same opts as dev brain-receipt).
 * Usage: npx tsx scripts/run-paid-generate-once.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

process.env.ALLOW_PAID_LLM = 'true';
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { runDailyGenerate } = await import('../lib/cron/daily-brief-generate');
  const { OWNER_USER_ID } = await import('../lib/auth/constants');
  const uid = (process.env.INGEST_USER_ID || process.env.AUDIT_USER_ID || OWNER_USER_ID).trim();

  const result = await runDailyGenerate({
    userIds: [uid],
    skipStaleGate: true,
    skipSpendCap: true,
    skipManualCallLimit: true,
    forceFreshRun: true,
    briefInvocationSource: 'dev_brain_receipt',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
