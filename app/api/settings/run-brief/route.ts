import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import {
  runDailyBrief,
  runDailySend,
  toSafeDailyBriefStageStatus,
} from '@/lib/cron/daily-brief';
import { syncGoogle } from '@/lib/sync/google-sync';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ManualSyncStageResult {
  ok: boolean;
  provider: 'google' | 'microsoft';
  skipped?: boolean;
  error?: string;
  total?: number;
}

function generatedDirectiveForUser(
  userId: string,
  results: Array<{ code: string; userId?: string }>,
): boolean {
  return results.some((result) =>
    result.userId === userId &&
    (result.code === 'pending_approval_persisted' || result.code === 'pending_approval_reused'));
}

function emailSentForUser(
  userId: string,
  results: Array<{ code: string; userId?: string }>,
): boolean {
  return results.some((result) =>
    result.userId === userId &&
    (result.code === 'email_sent' || result.code === 'email_already_sent'));
}

async function runManualSync(
  provider: 'google' | 'microsoft',
  userId: string,
): Promise<ManualSyncStageResult> {
  try {
    if (provider === 'google') {
      const result = await syncGoogle(userId);
      if (result.error === 'no_token') {
        return { ok: true, provider, skipped: true };
      }

      return {
        ok: !result.error,
        provider,
        error: result.error,
        total: result.gmail_signals + result.calendar_signals + result.drive_signals,
      };
    }

    const result = await syncMicrosoft(userId);
    if (result.error === 'no_token') {
      return { ok: true, provider, skipped: true };
    }

    return {
      ok: !result.error,
      provider,
      error: result.error,
      total: result.mail_signals + result.calendar_signals + result.file_signals + result.task_signals,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = auth.userId;
    const [syncMicrosoftResult, syncGoogleResult] = await Promise.all([
      runManualSync('microsoft', userId),
      runManualSync('google', userId),
    ]);

    // Ceiling defense is a nightly batch (all users). Running it here per-click
    // was adding 15-30s overhead and causing 504s. Nightly-ops handles it at 4am.
    const brief = await runDailyBrief({ userIds: [userId] });

    let send = brief.send;
    let manualSendFallbackAttempted = false;

    if (generatedDirectiveForUser(userId, brief.generate.results) && !emailSentForUser(userId, brief.send.results)) {
      send = await runDailySend({ userIds: [userId] });
      manualSendFallbackAttempted = true;
    }

    const signalProcessing = toSafeDailyBriefStageStatus(brief.signal_processing);
    const generate = toSafeDailyBriefStageStatus(brief.generate);
    const sendStage = toSafeDailyBriefStageStatus(send);
    const dailyBriefOk =
      (signalProcessing.status === 'ok' || signalProcessing.status === 'skipped') &&
      (generate.status === 'ok' || generate.status === 'skipped') &&
      (sendStage.status === 'ok' || sendStage.status === 'skipped');
    const ok = dailyBriefOk && syncMicrosoftResult.ok && syncGoogleResult.ok;

    return NextResponse.json({
      ok,
      stages: {
        sync_microsoft: syncMicrosoftResult,
        sync_google: syncGoogleResult,
        daily_brief: {
          date: brief.date,
          ok: dailyBriefOk,
          signal_processing: { ...signalProcessing, results: brief.signal_processing.results },
          generate: { ...generate, results: brief.generate.results },
          send: { ...sendStage, results: send.results },
          manual_send_fallback_attempted: manualSendFallbackAttempted,
        },
      },
    }, { status: ok ? 200 : 207 });
  } catch (error: unknown) {
    return apiError(error, 'settings/run-brief');
  }
}
