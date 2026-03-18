import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  getTriggerResponseStatus,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await runDailyBrief();
    const signalProcessing = toSafeDailyBriefStageStatus(result.signal_processing);
    const generate = toSafeDailyBriefStageStatus(result.generate);
    const send = toSafeDailyBriefStageStatus(result.send);

    return NextResponse.json(
      {
        date: result.date,
        ok: result.ok,
        signal_processing: { ...signalProcessing, results: result.signal_processing.results },
        generate: { ...generate, results: result.generate.results },
        send: { ...send, results: result.send.results },
      },
      { status: getTriggerResponseStatus(signalProcessing, generate, send) },
    );
  } catch (error: unknown) {
    return apiError(error, 'cron/daily-brief');
  }
}

export const GET = handler;
export const POST = handler;
