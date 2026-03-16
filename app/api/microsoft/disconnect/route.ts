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
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Mark integration as inactive
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('integrations')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('provider', 'azure_ad')
      .select('provider')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Microsoft integration not found' }, { status: 404 });
    }

    // Delete from user_tokens after the integration write succeeds.
    await deleteUserToken(userId, 'microsoft');

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return apiError(err, 'microsoft/disconnect');
  }
}
