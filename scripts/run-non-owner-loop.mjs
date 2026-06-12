#!/usr/bin/env node
/**
 * #259 Non-owner paid loop — full driver script.
 *
 * Drives every step of the loop for a non-owner user via CRON_SECRET +
 * x-as-user-id header (requires resolveAnyUser patch from #259).
 *
 * Usage:
 *   CRON_SECRET=<secret> BASE_URL=https://www.foldera.ai \
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   node scripts/run-non-owner-loop.mjs <user_id>
 */

const userId = process.argv[2];
if (!userId) {
  console.error('ERROR: user_id argument required');
  console.error('Usage: CRON_SECRET=<s> BASE_URL=<url> node scripts/run-non-owner-loop.mjs <user_id>');
  process.exit(1);
}

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = (process.env.BASE_URL ?? 'https://www.foldera.ai').replace(/\/$/, '');

if (!CRON_SECRET) {
  console.error('ERROR: CRON_SECRET env var required');
  process.exit(1);
}

function cronHeaders(extraUserId) {
  const h = {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json',
  };
  if (extraUserId) h['x-as-user-id'] = extraUserId;
  return h;
}

async function step(label, fn) {
  process.stdout.write(`\n[${label}] ... `);
  try {
    const result = await fn();
    console.log('OK');
    return result;
  } catch (err) {
    console.log(`FAIL — ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log(`\n=== #259 Non-owner loop driver ===`);
  console.log(`User:     ${userId}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Time:     ${new Date().toISOString()}`);

  // Step 1 — sync Google (runs for ALL users with Google tokens, including non-owner)
  await step('sync-google', async () => {
    const res = await fetch(`${BASE_URL}/api/cron/sync-google`, {
      headers: cronHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    const userResult = body.results?.find(r => r.userId === userId);
    if (userResult) {
      console.log(`\n  gmail_signals=${userResult.gmail_signals ?? 0}, calendar_signals=${userResult.calendar_signals ?? 0}, error=${userResult.error ?? 'none'}`);
    } else {
      console.log(`\n  user not in results — may have no Google token or was skipped`);
      console.log(`  full results: ${JSON.stringify(body.results ?? body)}`);
    }
    return body;
  });

  // Step 2 — seed workday_presence_state from scorer
  await step('seed-from-scorer', async () => {
    const res = await fetch(`${BASE_URL}/api/workday-presence/seed-from-scorer`, {
      method: 'POST',
      headers: cronHeaders(userId),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    console.log(`\n  state_source=${body.state_source ?? '?'}, current_focus=${JSON.stringify(body.current_focus ?? '?')}`);
    return body;
  });

  // Step 3 — get Right Now card
  const card = await step('right-now GET', async () => {
    const res = await fetch(`${BASE_URL}/api/slack/test-mode/right-now`, {
      headers: cronHeaders(userId),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    console.log(`\n  card type=${body.payload?.type ?? '?'}, text=${JSON.stringify((body.slack_test_mode?.text ?? '').slice(0, 80))}`);
    return body;
  });

  // Step 4 — close loop with "done"
  await step('interaction POST (done)', async () => {
    const res = await fetch(`${BASE_URL}/api/slack/test-mode/interaction`, {
      method: 'POST',
      headers: cronHeaders(userId),
      body: JSON.stringify({ action_id: 'done' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
    console.log(`\n  receipt_id=${body.receipt?.id ?? '?'}, action=${body.receipt?.action ?? '?'}`);
    return body;
  });

  console.log('\n=== All steps complete. Running verify... ===\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
