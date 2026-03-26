import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = createServerClient();

    // Explicitly delete orphan-prone tables before auth.users deletion.
    // tkg_ tables should CASCADE from auth.users but user_tokens and
    // user_subscriptions do not. api_usage is kept for billing audit trail.
    await supabase.from('user_tokens').delete().eq('user_id', userId);
    await supabase.from('user_subscriptions').delete().eq('user_id', userId);

    // Explicit tkg_ deletes as a safety net in case CASCADE is not configured
    await supabase.from('tkg_actions').delete().eq('user_id', userId);
    await supabase.from('tkg_commitments').delete().eq('user_id', userId);
    await supabase.from('tkg_signals').delete().eq('user_id', userId);
    await supabase.from('tkg_entities').delete().eq('user_id', userId);
    await supabase.from('tkg_goals').delete().eq('user_id', userId);
    await supabase.from('tkg_pattern_metrics').delete().eq('user_id', userId);

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return apiError(error, 'account/delete');
  }
}

