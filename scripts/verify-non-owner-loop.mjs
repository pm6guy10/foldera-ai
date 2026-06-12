#!/usr/bin/env node
/**
 * #259 Non-owner paid loop — DB verification script.
 *
 * Checks all 5 acceptance-criteria checkpoints in Supabase for a given
 * non-owner user_id. Run this AFTER the non-owner has completed the loop
 * in the browser:
 *   1. Sign up (OAuth)
 *   2. Connect Gmail
 *   3. sync-google cron run
 *   4. POST /api/workday-presence/seed-from-scorer (browser session)
 *   5. GET  /api/slack/test-mode/right-now         (browser session)
 *   6. POST /api/slack/test-mode/interaction       (browser session)
 *
 * Usage:
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-non-owner-loop.mjs <user_id>
 *
 * user_id: Supabase auth UUID for the non-owner user.
 */

const userId = process.argv[2];
if (!userId) {
  console.error('ERROR: user_id argument is required');
  console.error('Usage: SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-non-owner-loop.mjs <user_id>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  process.exit(1);
}

async function query(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function adminGet(path) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  return res.json();
}

async function main() {
  console.log(`\n=== #259 Non-owner paid loop — DB verification ===`);
  console.log(`User ID: ${userId}`);
  console.log(`Time:    ${new Date().toISOString()}\n`);

  const results = [];

  // Checkpoint 1 — auth.users row exists
  console.log('Checkpoint 1: auth.users row');
  const userRow = await adminGet(`users/${userId}`);
  const c1 = !!userRow?.id;
  console.log(`  ${c1 ? 'PASS' : 'FAIL'} — user row ${c1 ? 'found' : 'NOT found'}`);
  if (c1) console.log(`  email: ${userRow.email}, created: ${userRow.created_at}`);
  results.push({ checkpoint: 'auth.users row', pass: c1 });

  // Checkpoint 2 — user_subscriptions row
  console.log('\nCheckpoint 2: user_subscriptions row');
  const subs = await query(`user_subscriptions?user_id=eq.${userId}&select=id,plan,status,trial_ends_at`);
  const c2 = Array.isArray(subs) && subs.length > 0;
  console.log(`  ${c2 ? 'PASS' : 'FAIL'} — subscription row ${c2 ? 'found' : 'NOT found'}`);
  if (c2) console.log(`  plan: ${subs[0].plan}, status: ${subs[0].status}, trial_ends_at: ${subs[0].trial_ends_at}`);
  results.push({ checkpoint: 'user_subscriptions row', pass: c2 });

  // Checkpoint 3 — at least one tkg_signals row
  console.log('\nCheckpoint 3: tkg_signals row (source ingested)');
  const signals = await query(`tkg_signals?user_id=eq.${userId}&select=id,source,created_at&limit=3`);
  const c3 = Array.isArray(signals) && signals.length > 0;
  console.log(`  ${c3 ? 'PASS' : 'FAIL'} — ${Array.isArray(signals) ? signals.length : 0} signal(s) found`);
  if (c3) signals.forEach(s => console.log(`  source=${s.source}, id=${s.id}, created=${s.created_at}`));
  results.push({ checkpoint: 'tkg_signals ingested', pass: c3 });

  // Checkpoint 4 — workday_presence_state seeded in user_metadata
  console.log('\nCheckpoint 4: workday_presence_state seeded (scoreOpenLoops winner)');
  const state = userRow?.user_metadata?.workday_presence_state;
  const c4 = !!state?.current_focus && state?.state_source === 'scored_winner';
  console.log(`  ${c4 ? 'PASS' : 'FAIL'} — state_source=${state?.state_source ?? 'none'}, current_focus=${state?.current_focus ?? 'none'}`);
  results.push({ checkpoint: 'workday_presence_state seeded', pass: c4 });

  // Checkpoint 5 — tkg_actions receipt with status approved
  console.log('\nCheckpoint 5: tkg_actions receipt (loop closed)');
  const actions = await query(
    `tkg_actions?user_id=eq.${userId}&action_type=eq.presence_action&select=id,status,directive_text,created_at&order=created_at.desc&limit=3`,
  );
  const c5 = Array.isArray(actions) && actions.some(a => a.status === 'approved' || a.status === 'draft_rejected');
  console.log(`  ${c5 ? 'PASS' : 'FAIL'} — ${Array.isArray(actions) ? actions.length : 0} presence_action row(s) found`);
  if (Array.isArray(actions)) {
    actions.forEach(a => console.log(`  id=${a.id}, status=${a.status}, directive="${a.directive_text}", created=${a.created_at}`));
  }
  results.push({ checkpoint: 'tkg_actions receipt', pass: c5 });

  // Summary
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\n=== PROOF RESULT: ${passed}/${total} checkpoints passed ===`);
  results.forEach(r => console.log(`  ${r.pass ? 'PASS' : 'FAIL'} — ${r.checkpoint}`));

  const allPass = passed === total;
  if (allPass) {
    console.log('\nPASS — non-owner paid loop proven end-to-end.');
  } else {
    console.warn('\nPARTIAL — loop incomplete. Fix failing checkpoints and re-run.');
  }

  return allPass;
}

main().then(ok => process.exit(ok ? 0 : 1)).catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
