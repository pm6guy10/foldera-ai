import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  getTriggerResponseStatus,
  runDailyGenerate,
  runDailySend,
  toSafeDailyBriefStageStatus,
  type SafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';

export const dynamic = 'force-dynamic';

function failedStage(summary: string): SafeDailyBriefStageStatus {
  return {
    attempted: 0,
    errors: [summary],
    failed: 0,
    status: 'failed',
    succeeded: 0,
    summary,
  };
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  let generate = failedStage('Generate did not run.');
  let send = failedStage('Send did not run.');

  try {
    generate = toSafeDailyBriefStageStatus(await runDailyGenerate());
  } catch {
    console.error('[cron/trigger] generate stage failed');
    generate = failedStage('Generate failed before completion.');
  }

  try {
    send = toSafeDailyBriefStageStatus(await runDailySend());
  } catch {
    console.error('[cron/trigger] send stage failed');
    send = failedStage('Send failed before completion.');
  }

  const ok =
    (generate.status === 'ok' || generate.status === 'skipped') &&
    (send.status === 'ok' || send.status === 'skipped');

  return NextResponse.json(
    { ok, generate, send },
    { status: getTriggerResponseStatus(generate, send) },
  );
}

export const GET = handler;
export const POST = handler;
