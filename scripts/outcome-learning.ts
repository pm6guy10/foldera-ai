#!/usr/bin/env node

/**
 * Deterministic Outcome Learning proof.
 *
 * Uses stored TKG rows plus the CWU seed context. It does not call paid models,
 * send email, touch Stripe, change schema, or store sensitive third-party data.
 * With --persist-patterns, it idempotently upserts count-based pattern memory
 * into tkg_pattern_metrics for the requested user.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

import { OWNER_USER_ID } from '../lib/auth/constants';
import { createServerClient } from '../lib/db/client';
import {
  getOutcomeLearningForUser,
  persistOutcomePatternMemoryUpdates,
} from '../lib/outcome-learning/outcome-learning-engine';

config({ path: resolve(process.cwd(), '.env.local') });
process.env.ALLOW_PAID_LLM = 'false';
process.env.ALLOW_PROD_PAID_LLM = 'false';

async function main() {
  const args = process.argv.slice(2);
  const persistPatterns = args.includes('--persist-patterns');
  const queryArg = args.filter((arg) => arg !== '--persist-patterns').join(' ').trim();
  const query = queryArg || process.env.OUTCOME_AUTOPSY_QUERY || 'CWU Access Specialist';
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || OWNER_USER_ID || '').trim();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !userId) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or owner user id.');
    process.exit(1);
  }

  const supabase = createServerClient();
  const result = await getOutcomeLearningForUser(supabase, userId, {
    query,
    now: new Date().toISOString(),
  });

  if (!result) {
    console.error(`No outcome learning snapshot found for query "${query}".`);
    process.exit(1);
  }

  const patternPersistence = persistPatterns
    ? await persistOutcomePatternMemoryUpdates(supabase, userId, result.learning)
    : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        persisted_pattern_metrics: persistPatterns,
        pattern_persistence: patternPersistence,
        artifact: result.artifact,
        learning: result.learning,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
