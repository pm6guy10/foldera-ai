/**
 * POST /api/google/disconnect
 *
 * Disconnects the user's Google account by deleting the token from user_tokens.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { deleteUserToken, getUserToken } from '@/lib/auth/user-tokens';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const existing = await getUserToken(userId, 'google');
    if (!existing) {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 404 });
    }

    await deleteUserToken(userId, 'google');

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return apiError(err, 'google/disconnect');
  }
}
