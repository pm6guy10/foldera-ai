/**
 * GET /api/integrations/status
 *
 * Returns the list of connected OAuth integrations for the authenticated user.
 * Reads from `user_tokens` — the table that OAuth connect flows write to.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('user_tokens')
      .select('provider, email, last_synced_at, scopes, access_token')
      .eq('user_id', session.user.id);

    if (error) {
      throw error;
    }

    const integrations = (data ?? []).map((row: any) => {
      // Map user_tokens provider names to settings UI provider names
      const uiProvider = row.provider === 'microsoft' ? 'azure_ad' : row.provider;
      const hasToken = typeof row.access_token === 'string' && row.access_token.length > 0;

      return {
        provider: uiProvider,
        is_active: hasToken,
        sync_email: row.email ?? null,
        last_synced_at: row.last_synced_at ?? null,
        scopes: row.scopes ?? null,
      };
    });

    return NextResponse.json({ integrations });
  } catch (err: unknown) {
    return apiError(err, 'integrations/status');
  }
}
