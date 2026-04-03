/**
 * POST /api/google/disconnect
 *
 * Disconnects the user's Google account by soft-disconnecting the token row
 * in user_tokens (preserves row, clears secrets). Matches Microsoft's pattern.
 * Soft-disconnect ensures the row survives for auditing and reconnect flows —
 * saveUserToken upserts with disconnected_at=null to restore on reconnect.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { softDisconnectUserToken } from '@/lib/auth/user-tokens';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await softDisconnectUserToken(userId, 'google');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'google/disconnect');
  }
}
