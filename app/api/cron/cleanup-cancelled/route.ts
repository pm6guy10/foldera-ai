/**
 * GET /api/cron/cleanup-cancelled
 *
 * Runs daily at 5 AM. Deletes all graph data for users whose
 * data_deletion_scheduled_at has passed and status is still 'cancelled'
 * (i.e., they did not resubscribe within 30 days).
 *
 * Also revokes their Google OAuth token via Google's revoke endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  // Find users past their deletion date
  const { data: expired, error } = await supabase
    .from('user_subscriptions')
    .select('user_id')
    .eq('status', 'cancelled')
    .not('data_deletion_scheduled_at', 'is', null)
    .lte('data_deletion_scheduled_at', now);

  if (error) {
    console.error('[cleanup-cancelled] query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No users past deletion date' });
  }

  const userIds = expired.map(r => r.user_id as string);
  console.log('[cleanup-cancelled] deleting data for', userIds.length, 'cancelled users');

  const tables = [
    'tkg_signals',
    'tkg_commitments',
    'tkg_goals',
    'tkg_actions',
    'tkg_briefings',
    'tkg_entities',
    'tkg_patterns',
  ];

  const errors: string[] = [];

  for (const table of tables) {
    const { error: delErr } = await supabase.from(table).delete().in('user_id', userIds);
    if (delErr) errors.push(`${table}: ${delErr.message}`);
  }

  // Revoke Google OAuth tokens and delete integration rows
  for (const userId of userIds) {
    try {
      const { data: integration } = await supabase
        .from('integrations')
        .select('credentials, provider')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle();

      if (integration?.credentials) {
        const creds = integration.credentials as Record<string, unknown>;
        const accessToken = creds.access_token as string | undefined;
        const refreshToken = creds.refresh_token as string | undefined;
        const tokenToRevoke = accessToken ?? refreshToken;

        if (tokenToRevoke) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
            method: 'POST',
          }).catch(err => console.warn('[cleanup-cancelled] token revoke failed:', err.message));
        }
      }
    } catch (err: unknown) {
      errors.push(`token revoke for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Delete integration rows
  await supabase.from('integrations').delete().in('user_id', userIds);

  // Mark subscriptions as data_deleted to prevent double-deletion
  await supabase
    .from('user_subscriptions')
    .update({ status: 'data_deleted' })
    .in('user_id', userIds);

  if (errors.length > 0) console.error('[cleanup-cancelled] some steps failed:', errors);

  return NextResponse.json({ deleted: userIds.length, errors: errors.length > 0 ? errors : undefined });
}
