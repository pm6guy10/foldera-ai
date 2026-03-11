/**
 * GET /api/cron/sync-email
 *
 * Nightly cron (2 AM) — fetches the past 24 h of email from Outlook and Gmail,
 * batches the snippets, and pipes each batch through extractFromConversation()
 * to write decisions, patterns, and signals into the tkg_ identity graph.
 *
 * Authentication: CRON_SECRET (Bearer token in Authorization header).
 * On Vercel this header is set automatically by the cron runtime.
 *
 * The route is intentionally idempotent: extractFromConversation() deduplicates
 * content via SHA-256 hashes on tkg_signals, so running it twice on the same
 * emails is safe.
 */

import { NextResponse }                from 'next/server';
import { fetchOutlookEmails }          from '@/lib/integrations/outlook-client';
import { fetchGmailEmails }            from '@/lib/integrations/gmail-client';
import { extractFromConversation }     from '@/lib/extraction/conversation-extractor';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300; // 5 min — email + extraction can be slow

// ---------------------------------------------------------------------------

interface SyncResult {
  source: string;
  emails: number;
  signals: number;
  decisions: number;
  error?: string;
}

export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  // ── Sync sources in parallel ────────────────────────────────────────────────
  const [outlookResult, gmailResult] = await Promise.all([
    syncSource('outlook', () => fetchOutlookEmails(userId, 24), userId),
    syncSource('gmail',   () => fetchGmailEmails(userId, 24),   userId),
  ]);

  const results = [outlookResult, gmailResult];
  const totalSignals   = results.reduce((s, r) => s + r.signals,   0);
  const totalDecisions = results.reduce((s, r) => s + r.decisions, 0);

  console.log(
    '[sync-email] done —',
    results.map(r => `${r.source}: ${r.emails} emails → ${r.decisions} decisions${r.error ? ` (err: ${r.error})` : ''}`).join(' | '),
  );

  return NextResponse.json({
    ok: true,
    signals:   totalSignals,
    decisions: totalDecisions,
    sources:   results,
  });
}

// ---------------------------------------------------------------------------
// Helper: fetch emails for one source and extract signals
// ---------------------------------------------------------------------------

async function syncSource(
  name: string,
  fetchFn: () => Promise<string[]>,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = { source: name, emails: 0, signals: 0, decisions: 0 };

  try {
    const emails = await fetchFn();
    result.emails = emails.length;

    if (emails.length === 0) return result;

    // Join snippets into a single document for extraction.
    // The extractor hashes content → duplicate runs are safe.
    const batch = emails.join('\n\n---\n\n');
    const extracted = await extractFromConversation(batch, userId);

    result.signals   = 1; // one tkg_signal per batch
    result.decisions = extracted.decisionsWritten;
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error(`[sync-email/${name}]`, err);
  }

  return result;
}
