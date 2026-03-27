import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { runBriefLifecycle } from '@/lib/cron/brief-service';
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
    const { result: dailyBrief, sendFallbackAttempted } = await runBriefLifecycle({
      userIds: [userId],
      ensureSend: true,
    });

    const ok = dailyBrief.ok && syncMicrosoftResult.ok && syncGoogleResult.ok;

    return NextResponse.json({
      ok,
      stages: {
        sync_microsoft: syncMicrosoftResult,
        sync_google: syncGoogleResult,
        daily_brief: {
          ...dailyBrief,
          manual_send_fallback_attempted: sendFallbackAttempted,
        },
      },
    }, { status: ok ? 200 : 207 });
  } catch (error: unknown) {
    return apiError(error, 'settings/run-brief');
  }
}
