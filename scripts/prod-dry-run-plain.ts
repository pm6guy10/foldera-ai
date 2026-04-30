/**
 * POST production /api/settings/run-brief?dry_run=true&force=true with Playwright storage state.
 * Prints plain-English summary (winner topic, action shape, confidence).
 *
 * Prereq: tests/production/auth-state.json (npm run test:prod:setup)
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { requireProdProofAllowed } from './prod-proof-guard';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const PROD = 'https://foldera.ai';
const statePath = path.join(process.cwd(), 'tests', 'production', 'auth-state.json');

function actionPlain(action: string | undefined): string {
  switch (action) {
    case 'send_message':
      return 'send an email (draft a message to someone)';
    case 'write_document':
      return 'write a short document or memo for you to approve';
    case 'make_decision':
      return 'frame a decision for you to approve';
    case 'do_nothing':
      return 'hold off — no outbound action this cycle';
    default:
      return action ? `take this type of step: ${action}` : 'unknown action type';
  }
}

async function main() {
  requireProdProofAllowed('prod-dry-run-plain');

  if (!fs.existsSync(statePath)) {
    console.error(`Missing ${statePath}. Run: npm run test:prod:setup`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: PROD,
    storageState: statePath,
  });

  const res = await context.request.post(`${PROD}/api/settings/run-brief?dry_run=true&force=true`, {
    headers: { Accept: 'application/json' },
    timeout: 150_000,
  });

  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.error('Non-JSON', res.status(), text.slice(0, 600));
    await browser.close();
    process.exit(1);
    return;
  }

  const stages = body.stages as Record<string, unknown> | undefined;
  const daily = stages?.daily_brief as Record<string, unknown> | undefined;
  const gen = daily?.generate as Record<string, unknown> | undefined;
  const results = (gen?.results as Record<string, unknown>[] | undefined) ?? [];

  const dry = results.find((r) => r.code === 'pipeline_dry_run');
  const meta = (dry?.meta as Record<string, unknown> | undefined) ?? {};
  const receipt = meta.pipeline_dry_run as Record<string, unknown> | undefined;
  const genLog = meta.generation_log as Record<string, unknown> | undefined;
  const trace = genLog?.winnerSelectionTrace as Record<string, unknown> | undefined;
  const cd = genLog?.candidateDiscovery as Record<string, unknown> | undefined;
  const top = cd?.topCandidates as Record<string, unknown>[] | undefined;

  console.log('\n========== FOLDERA DRY RUN (plain English) ==========\n');
  console.log(`HTTP status: ${res.status()}`);
  console.log(`Spend policy: ${JSON.stringify(body.spend_policy ?? {})}\n`);

  const summary = receipt?.operator_summary;
  if (typeof summary === 'string' && summary.length > 0) {
    console.log('IN ONE PARAGRAPH (from the server):');
    console.log(`  ${summary}\n`);
  }

  if (!dry) {
    console.log('No pipeline_dry_run result in response. Raw generate.results codes:');
    for (const r of results) {
      console.log(`  - ${String(r.code)} success=${r.success} detail=${String(r.detail ?? '').slice(0, 200)}`);
    }
    console.log('\nFull JSON (truncated):\n', JSON.stringify(body, null, 2).slice(0, 4000));
    await browser.close();
    process.exit(res.ok() ? 0 : 1);
    return;
  }

  const title = String(receipt?.candidate_title ?? '(no title)');
  const candId = String(receipt?.candidate_id ?? '');
  const candType = String(receipt?.candidate_type ?? '');
  const actionType = String(meta.action_type ?? '');
  const conf = meta.confidence;

  console.log('WHAT WON (the thing Foldera thinks deserves attention right now):');
  console.log(`  "${title}"`);
  console.log('');
  console.log('WHAT IT WOULD DO NEXT (shape of the work — not real text in dry run):');
  console.log(`  ${actionPlain(actionType)}`);
  console.log('');
  console.log('HOW STRONG THE MATCH IS (scoring engine, not a grade on your life):');
  console.log(`  ${typeof conf === 'number' ? conf : '?'} out of 100`);
  console.log('');
  console.log('LABELS (for support / debugging):');
  console.log(`  Candidate type: ${candType || '—'}`);
  console.log(`  Internal id: ${candId || '—'}`);
  if (trace?.scorerTopDisplacementReason) {
    console.log(`  Note: top scorer pick was adjusted — ${String(trace.scorerTopDisplacementReason)}`);
  }
  if (top?.[0]) {
    const t0 = top[0];
    console.log(`  #1 scored item: ${String(t0.id ?? '').slice(0, 60)}… (${t0.candidateType}, score ${t0.score})`);
  }

  console.log('');
  console.log(
    'IMPORTANT: Dry run does NOT call the AI. The email/doc body is a placeholder. ',
    'Use “Generate with AI” on Settings if you want real drafted text.',
  );
  console.log('\n====================================================\n');

  await browser.close();
  process.exit(res.ok() || res.status() === 207 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
