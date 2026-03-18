import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  countUnprocessedSignals,
  listUsersWithUnprocessedSignals,
  processUnextractedSignals,
} from '@/lib/signals/signal-processor';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_SIGNALS = 5;
const MAX_SIGNALS_PER_REQUEST = 50;

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

function resolveRequestedLimit(request: NextRequest): number {
  const limitParam = request.nextUrl.searchParams.get('maxSignals');
  const parsed = Number(limitParam ?? DEFAULT_MAX_SIGNALS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_SIGNALS;
  }

  return Math.min(MAX_SIGNALS_PER_REQUEST, Math.floor(parsed));
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const maxSignals = resolveRequestedLimit(request);
    const signalCreatedAtGte = resolveSignalCreatedAtGte(request);
    const userIds = await listUsersWithUnprocessedSignals({
      createdAtGte: signalCreatedAtGte ?? undefined,
    });

    if (userIds.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        remaining: 0,
        maxSignals,
      });
    }

    let processed = 0;
    let remaining = 0;

    for (const userId of userIds) {
      if (processed >= maxSignals) {
        remaining += await countUnprocessedSignals(userId);
        continue;
      }

      const remainingCapacity = maxSignals - processed;
      const extraction = await processUnextractedSignals(userId, {
        createdAtGte: signalCreatedAtGte ?? undefined,
        maxSignals: remainingCapacity,
      });

      processed += extraction.signals_processed;
      remaining += await countUnprocessedSignals(userId, {
        createdAtGte: signalCreatedAtGte ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      processed,
      remaining,
      maxSignals,
    });
  } catch (error: unknown) {
    return apiError(error, 'cron/process-unprocessed-signals');
  }
}

export const GET = handler;
export const POST = handler;
