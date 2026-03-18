import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'Manual brief trigger is unavailable.' },
        { status: 500 },
      );
    }

    const triggerUrl = new URL('/api/cron/daily-brief', request.url);
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Manual brief trigger returned an invalid response.' },
        { status: 500 },
      );
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error: unknown) {
    return apiError(error, 'settings/run-brief');
  }
}
