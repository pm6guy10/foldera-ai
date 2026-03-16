/**
 * POST /api/microsoft/disconnect
 *
 * Disconnects the user's Microsoft account by deleting the token from
 * user_tokens and marking the integration as inactive.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { deleteUserToken } from '@/lib/auth/user-tokens';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Delete from user_tokens
    await deleteUserToken(userId, 'microsoft');

    // Mark integration as inactive
    const supabase = createServerClient();
    await supabase
      .from('integrations')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('provider', 'azure_ad');

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[microsoft/disconnect]', err);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
