/**
 * GET /api/cron/ttl-cleanup
 *
 * Nightly cron — permanently deletes tkg_signals rows older than 7 days.
 * Keeps the table lean and limits raw-signal exposure window.
 *
 * Authentication: CRON_SECRET (Bearer token in Authorization header).
 * Do NOT touch tkg_pattern_metrics.
 */

import { NextResponse }       from 'next/server';
import { resolveCronUser }    from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase  = createServerClient();
  const cutoff    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('tkg_signals')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('[ttl-cleanup] delete failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = count ?? 0;
  console.log(`[ttl-cleanup] deleted ${deleted} tkg_signals rows older than 7 days (cutoff: ${cutoff})`);

  return NextResponse.json({ ok: true, deleted, cutoff });
}
