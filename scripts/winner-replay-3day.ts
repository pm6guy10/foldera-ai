#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';

import { OWNER_USER_ID } from '../lib/auth/constants';
import { getWinnerTruthReport } from '../lib/system/winner-truth';

config({ path: resolve(process.cwd(), '.env.local') });
process.env.ALLOW_PAID_LLM = 'false';
process.env.ALLOW_PROD_PAID_LLM = 'false';

async function main() {
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || OWNER_USER_ID || '').trim();
  const report = await getWinnerTruthReport(userId);
  console.log(JSON.stringify(report.three_day_consistency, null, 2));
  if (!report.three_day_consistency.passes) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
