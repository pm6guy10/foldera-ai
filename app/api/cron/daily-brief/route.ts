import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  getTriggerResponseStatus,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

function resolveSignalCreatedAtGte(request: NextRequest): string | null {
  const raw = request.nextUrl.searchParams.get('signalCreatedAtGte');
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const signalCreatedAtGte = resolveSignalCreatedAtGte(request);
    const result = await runDailyBrief({
      signalCreatedAtGte: signalCreatedAtGte ?? undefined,
    });
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
