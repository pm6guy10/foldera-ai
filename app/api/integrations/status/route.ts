/**
 * GET /api/integrations/status
 *
 * Returns the list of connected OAuth integrations for the authenticated user.
 * Queries the `integrations` table (service role bypasses RLS).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('integrations')
      .select('provider, is_active, connected_at')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('[integrations/status] query failed:', error.message);
      return NextResponse.json({ integrations: [] });
    }

    return NextResponse.json({ integrations: data || [] });
  } catch (err: any) {
    console.error('[integrations/status] unexpected error:', err.message);
    return NextResponse.json({ integrations: [] });
  }
}
