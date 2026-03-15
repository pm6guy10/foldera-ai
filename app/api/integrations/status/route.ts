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

    const [intResult, tokenResult] = await Promise.all([
      supabase
        .from('integrations')
        .select('provider, is_active, connected_at')
        .eq('user_id', session.user.id),
      supabase
        .from('user_tokens')
        .select('provider, email, last_synced_at')
        .eq('user_id', session.user.id),
    ]);

    if (intResult.error) {
      console.error('[integrations/status] query failed:', intResult.error.message);
    }

    // Merge user_tokens data into integrations
    const integrations = (intResult.data || []).map((int: any) => {
      const token = (tokenResult.data || []).find((t: any) => {
        if (int.provider === 'google' && t.provider === 'google') return true;
        if (int.provider === 'azure_ad' && t.provider === 'microsoft') return true;
        return false;
      });
      return {
        ...int,
        sync_email: token?.email ?? null,
        last_synced_at: token?.last_synced_at ?? null,
      };
    });

    return NextResponse.json({ integrations });
  } catch (err: any) {
    console.error('[integrations/status] unexpected error:', err.message);
    return NextResponse.json({ integrations: [] });
  }
}
