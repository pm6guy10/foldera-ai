import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { syncGoogle } from '@/lib/sync/google-sync';
import { rateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const rl = await rateLimit(`sync-now:google:${userId}`, { limit: 3, window: 3600 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Sync rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
        },
      },
    );
  }

  try {
    const result = await syncGoogle(userId);

    if (result.error === 'no_token') {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 },
      );
    }

    const total = result.gmail_signals + result.calendar_signals + result.drive_signals;

    return NextResponse.json({ ok: true, total, ...result });
  } catch (err: any) {
    console.error('[google/sync-now] error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err.message ?? 'Sync failed' },
      { status: 500 },
    );
  }
}
