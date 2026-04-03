/**
 * POST /api/microsoft/disconnect
 *
 * Disconnects the user's Microsoft account by soft-disconnecting the token row
 * in user_tokens (preserves row, clears secrets).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { getUserToken, softDisconnectUserToken } from '@/lib/auth/user-tokens';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const existing = await getUserToken(userId, 'microsoft');
    if (!existing) {
      return NextResponse.json({ error: 'Microsoft account not connected' }, { status: 404 });
    }

    await softDisconnectUserToken(userId, 'microsoft');

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'microsoft/disconnect');
  }
}
