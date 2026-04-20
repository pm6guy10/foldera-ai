import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  getTriggerResponseStatus,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // compatibility trigger — generate + send only

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const stages: Record<string, unknown> = {};

  // Compatibility entrypoint only — sync has been split into nightly-ops and
  // manual sync-now endpoints so this route cannot run the all-in-one pipeline.
  try {
    const result = await runDailyBrief({ briefInvocationSource: 'cron_trigger' });
    const signalProcessing = toSafeDailyBriefStageStatus(result.signal_processing);
    const generate = toSafeDailyBriefStageStatus(result.generate);
    const send = toSafeDailyBriefStageStatus(result.send);

    stages.daily_brief = {
      compatibility_mode: 'brief_only',
      date: result.date,
      ok: result.ok,
      signal_processing: { ...signalProcessing, results: result.signal_processing.results },
      generate: { ...generate, results: result.generate.results },
      send: { ...send, results: result.send.results },
      httpStatus: getTriggerResponseStatus(signalProcessing, generate, send),
    };
  } catch (err: any) {
    stages.daily_brief = { ok: false, error: err.message };
  }

  const dailyBriefHttpStatus =
    (stages.daily_brief as { httpStatus?: number } | undefined)?.httpStatus ??
    ((stages.daily_brief as { ok?: boolean } | undefined)?.ok === false ? 500 : 200);

  const hasFailure = dailyBriefHttpStatus >= 500;
  const hasPartial = !hasFailure && dailyBriefHttpStatus === 207;
  const responseStatus = hasFailure ? 500 : (hasPartial ? 207 : 200);
  const allOk = responseStatus === 200;

  return NextResponse.json(
    { ok: allOk, stages },
    { status: responseStatus },
  );
}

export const GET = handler;
export const POST = handler;
