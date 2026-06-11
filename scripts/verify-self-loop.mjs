#!/usr/bin/env node
/**
 * #226 Self-loop proof script.
 *
 * Step 1: POST /api/workday-presence/seed-from-scorer
 *   — runs scoreOpenLoops, seeds workday_presence_state with scored winner
 * Step 2: GET /api/slack/test-mode/right-now
 *   — reads the seeded state, returns test-mode message
 * Step 3: POST /api/slack/test-mode/interaction { action_id: 'done' }
 *   — records one Done interaction, closes the self-loop
 *
 * Usage:
 *   CRON_SECRET=<secret> node scripts/verify-self-loop.mjs [base_url]
 *
 * base_url defaults to https://www.foldera.ai
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const BASE_URL = process.argv[2]?.replace(/\/+$/, '') ?? 'https://www.foldera.ai';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('ERROR: CRON_SECRET env var is required');
  process.exit(1);
}

async function postJson(path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${CRON_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function getJson(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function main() {
  console.log(`\n=== #226 Slack Self-Loop Proof ===`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Step 1 — seed from scorer
  console.log('Step 1: POST /api/workday-presence/seed-from-scorer');
  const seed = await postJson('/api/workday-presence/seed-from-scorer');
  console.log(`  status: ${seed.status}`);
  if (seed.status !== 200) {
    console.error('  FAIL: seed endpoint returned non-200');
    console.error('  body:', JSON.stringify(seed.body, null, 2));
    process.exit(1);
  }
  console.log(`  seeded: ${seed.body.seeded}`);
  console.log(`  scorer_outcome: ${seed.body.scorer_outcome}`);
  if (seed.body.seeded) {
    console.log(`  winner.title: ${seed.body.winner?.title}`);
    console.log(`  winner.score: ${seed.body.winner?.score}`);
    console.log(`  winner.type: ${seed.body.winner?.type}`);
    console.log(`  winner.matched_goal: ${seed.body.winner?.matched_goal}`);
    console.log(`  state_source: ${seed.body.state_seeded?.state_source}`);
  } else {
    console.warn('  WARNING: no winner selected — pool may be empty or scorer returned no_valid_action');
    console.warn('  exact_blocker:', JSON.stringify(seed.body.exact_blocker));
    console.warn('  top_candidates:', JSON.stringify(seed.body.top_candidates));
    // Not fatal — continue to show what the test-mode card looks like
  }

  // Step 2 — read test-mode right-now message
  console.log('\nStep 2: GET /api/slack/test-mode/right-now');
  const rightNow = await getJson('/api/slack/test-mode/right-now');
  console.log(`  status: ${rightNow.status}`);
  if (rightNow.status !== 200) {
    console.error('  FAIL: right-now endpoint returned non-200');
    console.error('  body:', JSON.stringify(rightNow.body, null, 2));
    process.exit(1);
  }
  const sectionBlock = rightNow.body.slack_test_mode?.blocks?.find(b => b.type === 'section');
  const messageText = sectionBlock?.text?.text ?? '(no text)';
  console.log(`  message:\n    ${messageText.replace(/\n/g, '\n    ')}`);

  // Step 3 — fire Done interaction
  console.log('\nStep 3: POST /api/slack/test-mode/interaction { action_id: "done" }');
  const interaction = await postJson('/api/slack/test-mode/interaction', { action_id: 'done' });
  console.log(`  status: ${interaction.status}`);
  if (interaction.status !== 200) {
    console.error('  FAIL: interaction endpoint returned non-200');
    console.error('  body:', JSON.stringify(interaction.body, null, 2));
    process.exit(1);
  }
  console.log(`  acknowledged: ${interaction.body.acknowledged}`);
  console.log(`  action_id: ${interaction.body.action_id}`);
  const afterBlock = interaction.body.slack_test_mode?.blocks?.find(b => b.type === 'section');
  console.log(`  after message:\n    ${(afterBlock?.text?.text ?? '(none)').replace(/\n/g, '\n    ')}`);

  const stateSource = interaction.body.state?.state_source ?? '(unknown)';
  const interactionCount = interaction.body.state?.interaction_history?.length ?? 0;
  console.log(`  state_source: ${stateSource}`);
  console.log(`  interaction_history.length: ${interactionCount}`);

  console.log('\n=== PROOF RESULT ===');
  const proofOk = seed.body.seeded
    && seed.body.state_seeded?.state_source === 'scored_winner'
    && interaction.status === 200
    && interaction.body.action_id === 'done';

  if (proofOk) {
    console.log('PASS — self-loop complete: scored winner seeded, Done interaction recorded.');
    console.log(`Winner: "${seed.body.winner?.title}" (score ${seed.body.winner?.score}, type ${seed.body.winner?.type})`);
  } else {
    console.warn('PARTIAL — loop ran but proof bar not fully satisfied (check seeded/state_source above).');
  }

  return proofOk;
}

main().then(ok => process.exit(ok ? 0 : 1)).catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
