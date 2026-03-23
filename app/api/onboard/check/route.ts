import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { count } = await supabase
      .from('tkg_goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .in('source', ['onboarding_bucket', 'onboarding_stated', 'onboarding_marker']);

    return NextResponse.json({ hasOnboarded: (count ?? 0) > 0 });
  } catch (err) {
    return apiError(err, 'onboard/check');
  }
}
