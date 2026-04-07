import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  autoSkipStaleApprovals,
  getTriggerResponseStatus,
  runDailyBrief,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — sync + generate + send

interface SyncStageResult {
  ok: boolean;
  users: number;
  succeeded: number;
  failed: number;
  error?: string;
}

/**
 * Run sync for a given provider. Imports the sync function dynamically
 * to avoid module-level side effects.
 */
async function runSync(provider: 'google' | 'microsoft'): Promise<SyncStageResult> {
  const userIds = await getAllUsersWithProvider(provider);
  if (userIds.length === 0) {
    return { ok: true, users: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      if (provider === 'microsoft') {
        const { syncMicrosoft } = await import('@/lib/sync/microsoft-sync');
        const result = await syncMicrosoft(userId);
        if (result.error) {
          failed++;
        } else {
          succeeded++;
        }
      } else {
        const { syncGoogle } = await import('@/lib/sync/google-sync');
        const result = await syncGoogle(userId);
        if (result.error) {
          failed++;
        } else {
          succeeded++;
        }
      }
    } catch (err: any) {
      console.error(`[trigger] ${provider} sync error for ${userId}:`, err.message);
      failed++;
    }
  }

  return { ok: failed === 0, users: userIds.length, succeeded, failed };
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const stages: Record<string, unknown> = {};

  // Stage 1: Sync Microsoft
  try {
    stages.sync_microsoft = await runSync('microsoft');
  } catch (err: any) {
    stages.sync_microsoft = { ok: false, error: err.message };
  }

  // Stage 2: Sync Google
  try {
    stages.sync_google = await runSync('google');
  } catch (err: any) {
    stages.sync_google = { ok: false, error: err.message };
  }

  // Stage 3: Passive rejection — auto-skip pending_approval > 24h
  try {
    stages.passive_rejection = await autoSkipStaleApprovals();
  } catch (err: any) {
    stages.passive_rejection = { skipped: 0, error: err.message };
  }

  // Stage 4: Daily brief (generate + send)
  try {
    const result = await runDailyBrief({ briefInvocationSource: 'cron_trigger' });
    const signalProcessing = toSafeDailyBriefStageStatus(result.signal_processing);
    const generate = toSafeDailyBriefStageStatus(result.generate);
    const send = toSafeDailyBriefStageStatus(result.send);

    stages.daily_brief = {
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

  const syncMicrosoftFailed = (stages.sync_microsoft as { ok?: boolean } | undefined)?.ok === false;
  const syncGoogleFailed = (stages.sync_google as { ok?: boolean } | undefined)?.ok === false;
  const passiveRejectionError = Boolean(
    (stages.passive_rejection as { error?: string } | undefined)?.error,
  );
  const dailyBriefHttpStatus =
    (stages.daily_brief as { httpStatus?: number } | undefined)?.httpStatus ??
    ((stages.daily_brief as { ok?: boolean } | undefined)?.ok === false ? 500 : 200);

  const hasFailure = syncMicrosoftFailed || syncGoogleFailed || passiveRejectionError || dailyBriefHttpStatus >= 500;
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
