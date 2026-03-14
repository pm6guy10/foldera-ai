/**
 * GET /api/cron/ttl-cleanup
 *
 * Nightly cron — compresses old signals into weekly summaries,
 * then deletes tkg_signals rows older than 90 days.
 *
 * Summaries persist permanently as long-term context for the generator.
 * Raw signals are kept 90 days (encrypted via AES-256-GCM).
 *
 * Authentication: CRON_SECRET (Bearer token in Authorization header).
 * Do NOT touch tkg_pattern_metrics.
 */

import { NextResponse }       from 'next/server';
import { resolveCronUser }    from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { summarizeSignals }   from '@/lib/signals/summarizer';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

const RETENTION_DAYS = 90;

export async function GET(request: Request) {
  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient();
  const userId   = process.env.INGEST_USER_ID;

  // 1. Summarize unsummarized weeks before deleting anything
  let summarized = 0;
  if (userId) {
    try {
      summarized = await summarizeSignals(userId);
    } catch (err: any) {
      console.error('[ttl-cleanup] summarization failed:', err.message);
      // Continue to deletion even if summarization fails
    }
  }

  // 2. Delete signals older than 90 days
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('tkg_signals')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('[ttl-cleanup] delete failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = count ?? 0;
  console.log(`[ttl-cleanup] summarized ${summarized} weeks, deleted ${deleted} signals older than ${RETENTION_DAYS} days (cutoff: ${cutoff})`);

  return NextResponse.json({ ok: true, summarized, deleted, retentionDays: RETENTION_DAYS, cutoff });
}
