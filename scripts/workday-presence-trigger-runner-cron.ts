/**
 * Direct-call cron entrypoint for the workday-presence trigger-runner.
 *
 * The original design (.github/workflows/workday-presence-trigger-runner.yml)
 * called the Vercel HTTP route over curl with a CRON_SECRET bearer token. That
 * secret was never added to GitHub Actions, so every 15-minute run failed
 * auth and the "brain" never fired in production. This script calls the same
 * lib function the route calls (maybeRunWorkdayPresenceTriggerRunnerForUser)
 * directly against Supabase, the same way scripts/loop-health-guardian.ts
 * already does — no Vercel HTTP hop, no CRON_SECRET dependency.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOLDERA_SELF_USER_ID
 *      SLACK_BOT_TOKEN, FOLDERA_SLACK_SELF_CHANNEL_ID (read internally by the
 *      trigger-runner lib for the live Slack adapter)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { maybeRunWorkdayPresenceTriggerRunnerForUser } from '@/lib/workday-presence/trigger-runner';

async function main() {
  config({ path: resolve(process.cwd(), '.env.local') });

  const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
  if (!userId) {
    console.error('Missing FOLDERA_SELF_USER_ID');
    process.exit(1);
  }

  const result = await maybeRunWorkdayPresenceTriggerRunnerForUser(userId);

  console.log(
    `TRIGGER_RUNNER outcome=${result.started ? result.outcome : 'not_started'} reason=${result.reason}`,
  );
  console.log(JSON.stringify(result, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      summaryPath,
      `## Workday Presence Trigger Runner\n\n` +
        `**${result.started ? result.outcome : 'not_started'}** — ${result.reason}\n`,
    );
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
