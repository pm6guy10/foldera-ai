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

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return apiError(error, 'account/delete');
  }
}

