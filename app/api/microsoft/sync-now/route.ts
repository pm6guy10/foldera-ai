import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const result = await syncMicrosoft(userId);

    if (result.error === 'no_token') {
      return NextResponse.json(
        { error: 'Microsoft account not connected' },
        { status: 400 },
      );
    }

    const total =
      result.mail_signals +
      result.calendar_signals +
      result.file_signals +
      result.task_signals;

    return NextResponse.json({ ok: true, total, ...result });
  } catch (err: any) {
    console.error('[microsoft/sync-now] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Sync failed' },
      { status: 500 },
    );
  }
}
