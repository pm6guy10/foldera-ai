#!/usr/bin/env node

/**
 * Read-only Outcome Autopsy proof.
 *
 * Uses stored TKG rows only. It never calls paid models, sends email, mutates
 * Supabase, changes schema, or fabricates outcome rows.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

import { OWNER_USER_ID } from '../lib/auth/constants';
import { createServerClient } from '../lib/db/client';
import { getOutcomeAutopsyForUser } from '../lib/outcome-autopsy/outcome-autopsy';

config({ path: resolve(process.cwd(), '.env.local') });
process.env.ALLOW_PAID_LLM = 'false';
process.env.ALLOW_PROD_PAID_LLM = 'false';

async function main() {
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || OWNER_USER_ID || '').trim();
  const queryArg = process.argv.slice(2).join(' ').trim();
  const query = queryArg || process.env.OUTCOME_AUTOPSY_QUERY || 'CWU Access Specialist';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !userId) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or owner user id.');
    process.exit(1);
  }

  const artifact = await getOutcomeAutopsyForUser(createServerClient(), userId, {
    query,
    now: new Date().toISOString(),
  });

  if (!artifact) {
    console.error(`No completed outcome autopsy found for query "${query}".`);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, artifact }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
