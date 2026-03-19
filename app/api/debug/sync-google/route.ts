/**
 * POST /api/debug/sync-google
 *
 * One-off debug route: triggers Google sync for a specific user
 * and returns detailed diagnostics. Protected by CRON_SECRET.
 *
 * DELETE THIS ROUTE after debugging is complete.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const log: string[] = [];

  try {
    // Step 1: Check token
    log.push('Step 1: Checking user_tokens for google...');
    const { getUserToken } = await import('@/lib/auth/user-tokens');
    const token = await getUserToken(userId, 'google');

    if (!token) {
      log.push('FAIL: No token found in user_tokens for google');
      return NextResponse.json({ ok: false, log });
    }

    log.push(`Token found — email: ${token.email}`);
    log.push(`  refresh_token length: ${token.refresh_token?.length ?? 0}`);
    log.push(`  access_token length: ${token.access_token?.length ?? 0}`);
    log.push(`  expires_at: ${token.expires_at}`);
    log.push(`  last_synced_at: ${token.last_synced_at}`);

    // Check if refresh token is empty
    if (!token.refresh_token || token.refresh_token.length === 0) {
      log.push('FAIL: refresh_token is empty — OAuth did not return a refresh token');
      return NextResponse.json({ ok: false, log });
    }

    // Step 2: Run sync
    log.push('');
    log.push('Step 2: Running syncGoogle...');
    const { syncGoogle } = await import('@/lib/sync/google-sync');
    const result = await syncGoogle(userId);

    log.push(`Sync result: ${JSON.stringify(result)}`);

    // Step 3: Check signal counts
    log.push('');
    log.push('Step 3: Checking signal counts...');
    const { createServerClient } = await import('@/lib/db/client');
    const supabase = createServerClient();

    const { data: gmailCount } = await supabase
      .from('tkg_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'gmail');

    const { data: calCount } = await supabase
      .from('tkg_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'google_calendar');

    // Use count query
    const { count: gmailTotal } = await supabase
      .from('tkg_signals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'gmail');

    const { count: calTotal } = await supabase
      .from('tkg_signals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'google_calendar');

    log.push(`gmail signals: ${gmailTotal ?? 0}`);
    log.push(`google_calendar signals: ${calTotal ?? 0}`);

    return NextResponse.json({
      ok: !result.error,
      gmail_signals: result.gmail_signals,
      calendar_signals: result.calendar_signals,
      is_first_sync: result.is_first_sync,
      error: result.error,
      gmail_total: gmailTotal ?? 0,
      calendar_total: calTotal ?? 0,
      log,
    });
  } catch (err: any) {
    log.push(`EXCEPTION: ${err.message}`);
    log.push(`Stack: ${err.stack}`);
    return NextResponse.json({ ok: false, error: err.message, log }, { status: 500 });
  }
}
