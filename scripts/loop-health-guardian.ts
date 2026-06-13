/**
 * Loop-Health Guardian — the guardian for the guardian.
 *
 * Watches the ONE metric that means Foldera actually works: a human closed the
 * loop. The product can ingest signals, score commitments, and generate moves
 * all day (the "brain"), but it only delivers value when a person acts on a
 * surfaced move (the "hands"). That number went unwatched once and the loop sat
 * dead for ~7 weeks while every other check stayed green. This guardian makes
 * that impossible to miss again.
 *
 * Brain  = tkg_actions.generated_at (system produced a move)
 * Hands  = tkg_actions.approved_at  (a human closed the loop)
 *
 * Cold loop (hands silent beyond the threshold) exits non-zero so the scheduled
 * run goes red and GitHub notifies the owner. Pure logic lives in
 * evaluateLoopHealth so it is provable without touching live Supabase.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *      LOOP_HEALTH_COLD_DAYS (optional, default 4)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_COLD_THRESHOLD_DAYS = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LoopHealthInput = {
  lastApprovedAt: Date | string | null;
  lastGeneratedAt: Date | string | null;
  now: Date;
  coldThresholdDays: number;
};

export type LoopHealthResult = {
  daysSinceApproved: number | null;
  daysSinceGenerated: number | null;
  brainAlive: boolean;
  handsCold: boolean;
  status: 'OK' | 'COLD' | 'NEVER';
  message: string;
};

function daysBetween(now: Date, then: Date | string | null): number | null {
  if (then === null) return null;
  const thenDate = typeof then === 'string' ? new Date(then) : then;
  if (Number.isNaN(thenDate.getTime())) return null;
  return (now.getTime() - thenDate.getTime()) / MS_PER_DAY;
}

export function evaluateLoopHealth(input: LoopHealthInput): LoopHealthResult {
  const daysSinceApproved = daysBetween(input.now, input.lastApprovedAt);
  const daysSinceGenerated = daysBetween(input.now, input.lastGeneratedAt);

  // Brain is alive if the system generated a move within the cold window.
  const brainAlive =
    daysSinceGenerated !== null && daysSinceGenerated <= input.coldThresholdDays;

  if (daysSinceApproved === null) {
    return {
      daysSinceApproved: null,
      daysSinceGenerated,
      brainAlive,
      handsCold: true,
      status: 'NEVER',
      message:
        'NEVER CLOSED: no human has ever acted on a surfaced move. The loop has not closed once.',
    };
  }

  const handsCold = daysSinceApproved > input.coldThresholdDays;
  const approvedDays = daysSinceApproved.toFixed(1);

  if (handsCold) {
    const brainNote = brainAlive
      ? `Brain is alive (a move was generated ${(daysSinceGenerated ?? 0).toFixed(1)}d ago) but no human acted on it.`
      : 'Brain is also quiet (no recent generated move).';
    return {
      daysSinceApproved,
      daysSinceGenerated,
      brainAlive,
      handsCold: true,
      status: 'COLD',
      message: `LOOP COLD: ${approvedDays}d since a human closed the loop (threshold ${input.coldThresholdDays}d). ${brainNote}`,
    };
  }

  return {
    daysSinceApproved,
    daysSinceGenerated,
    brainAlive,
    handsCold: false,
    status: 'OK',
    message: `OK: a human closed the loop ${approvedDays}d ago (within ${input.coldThresholdDays}d).`,
  };
}

async function postSlackAlert(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.FOLDERA_SLACK_SELF_CHANNEL_ID;
  if (!token || !channel) return;
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (json.ok !== true) {
      console.warn(`loop-health Slack alert failed: ${json.error ?? res.status}`);
    }
  } catch (e) {
    console.warn('loop-health Slack alert error:', e);
  }
}

async function main() {
  config({ path: resolve(process.cwd(), '.env.local') });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const coldThresholdDays = Number(
    process.env.LOOP_HEALTH_COLD_DAYS ?? DEFAULT_COLD_THRESHOLD_DAYS.toString(),
  );
  const supabase = createClient(url, key);

  const [approvedRes, generatedRes] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('approved_at')
      .not('approved_at', 'is', null)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tkg_actions')
      .select('generated_at')
      .not('generated_at', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (approvedRes.error) {
    console.error('loop-health query (approved) failed:', approvedRes.error.message);
    process.exit(1);
  }
  if (generatedRes.error) {
    console.error('loop-health query (generated) failed:', generatedRes.error.message);
    process.exit(1);
  }

  const result = evaluateLoopHealth({
    lastApprovedAt: approvedRes.data?.approved_at ?? null,
    lastGeneratedAt: generatedRes.data?.generated_at ?? null,
    now: new Date(),
    coldThresholdDays,
  });

  // Always emit a machine-readable line so the metric is visible in logs/summaries.
  console.log(
    `LOOP_HEALTH status=${result.status} days_since_human_action=${
      result.daysSinceApproved === null ? 'never' : result.daysSinceApproved.toFixed(1)
    } brain_alive=${result.brainAlive}`,
  );
  console.log(result.message);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      summaryPath,
      `## Loop-Health Guardian\n\n**${result.status}** — ${result.message}\n\n` +
        `- Days since a human closed the loop: ${
          result.daysSinceApproved === null ? 'never' : result.daysSinceApproved.toFixed(1)
        }\n` +
        `- Days since the system generated a move: ${
          result.daysSinceGenerated === null ? 'never' : result.daysSinceGenerated.toFixed(1)
        }\n` +
        `- Cold threshold: ${coldThresholdDays}d\n`,
    );
  }

  if (result.status !== 'OK') {
    await postSlackAlert(`🚨 *LOOP HEALTH: ${result.status}* — ${result.message}`);
    process.exit(1);
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
