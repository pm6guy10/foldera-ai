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
import { createServerClient }          from '@/lib/db/client';
import { fetchOutlookEmails }          from '@/lib/integrations/outlook-client';
import { fetchGmailEmails }            from '@/lib/integrations/gmail-client';
import { extractFromConversation }     from '@/lib/extraction/conversation-extractor';
import { analyzeRelationships }        from '@/lib/relationships/tracker';

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
  const [outlookResult, gmailResult, outlookSentResult, gmailSentResult] = await Promise.all([
    syncSource('outlook', () => fetchOutlookEmails(userId, 24), userId),
    syncSource('gmail',   () => fetchGmailEmails(userId, 24),   userId),
    syncSource('outlook-sent', () => fetchOutlookSentMail(userId, 24), userId),
    syncSource('gmail-sent',   () => fetchGmailSentMail(userId, 24),   userId),
  ]);

  const results = [outlookResult, gmailResult, outlookSentResult, gmailSentResult];
  const totalSignals   = results.reduce((s, r) => s + r.signals,   0);
  const totalDecisions = results.reduce((s, r) => s + r.decisions, 0);

  // ── Fetch and flag stale drafts (>48h = avoidance signal) ─────────────────
  let draftsFound = 0;
  try {
    draftsFound = await flagStaleDrafts(userId);
  } catch (draftErr: any) {
    console.warn('[sync-email] draft scan failed:', draftErr.message);
  }

  // ── Analyze relationships post-extraction ──────────────────────────────────
  let relationshipsAnalyzed = 0;
  try {
    const metrics = await analyzeRelationships(userId);
    relationshipsAnalyzed = metrics.length;
  } catch (relErr: any) {
    console.warn('[sync-email] relationship analysis failed:', relErr.message);
  }

  console.log(
    '[sync-email] done —',
    results.map(r => `${r.source}: ${r.emails} emails → ${r.decisions} decisions${r.error ? ` (err: ${r.error})` : ''}`).join(' | '),
    `| drafts flagged: ${draftsFound} | relationships: ${relationshipsAnalyzed}`,
  );

  return NextResponse.json({
    ok: true,
    signals:   totalSignals,
    decisions: totalDecisions,
    sources:   results,
    drafts_flagged: draftsFound,
    relationships_analyzed: relationshipsAnalyzed,
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
    const sourceType = name.includes('sent') ? 'email' as const : 'email' as const;
    const extracted = await extractFromConversation(batch, userId, sourceType);

    result.signals   = 1; // one tkg_signal per batch
    result.decisions = extracted.decisionsWritten;
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error(`[sync-email/${name}]`, err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sent mail fetch helpers
// ---------------------------------------------------------------------------

async function fetchOutlookSentMail(userId: string, hoursBack: number): Promise<string[]> {
  try {
    const { getMicrosoftTokens } = await import('@/lib/auth/token-store');
    const tokens = await getMicrosoftTokens(userId);
    if (!tokens) return [];

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const url =
      `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages` +
      `?$filter=sentDateTime ge ${since}` +
      `&$select=id,subject,bodyPreview,toRecipients,sentDateTime` +
      `&$top=50&$orderby=sentDateTime desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.value ?? []).map((m: any) => {
      const to = (m.toRecipients ?? [])
        .map((r: any) => `${r.emailAddress?.name ?? ''} <${r.emailAddress?.address ?? ''}>`)
        .join(', ');
      return `[Sent email: ${m.sentDateTime}]\nTo: ${to}\nSubject: ${m.subject ?? '(no subject)'}\nPreview: ${m.bodyPreview ?? ''}`;
    });
  } catch { return []; }
}

async function fetchGmailSentMail(userId: string, hoursBack: number): Promise<string[]> {
  try {
    const { google } = await import('googleapis');
    const { getGoogleTokens } = await import('@/lib/auth/token-store');
    const tokens = await getGoogleTokens(userId);
    if (!tokens) return [];

    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const afterSec = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({ userId: 'me', q: `in:sent after:${afterSec}`, maxResults: 50 });
    const ids = list.data.messages ?? [];
    if (ids.length === 0) return [];

    const snippets: string[] = [];
    for (const { id } of ids) {
      if (!id) continue;
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'To', 'Date'] });
        const headers = msg.data.payload?.headers ?? [];
        const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
        snippets.push(`[Sent email: ${get('Date')}]\nTo: ${get('To')}\nSubject: ${get('Subject') || '(no subject)'}\nPreview: ${msg.data.snippet ?? ''}`);
      } catch { /* skip */ }
    }
    return snippets;
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Stale drafts: >48h drafts = avoidance signal
// ---------------------------------------------------------------------------

async function flagStaleDrafts(userId: string): Promise<number> {
  const supabase = createServerClient();
  let found = 0;

  // Outlook drafts
  try {
    const { getMicrosoftTokens } = await import('@/lib/auth/token-store');
    const tokens = await getMicrosoftTokens(userId);
    if (tokens) {
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/me/mailFolders/Drafts/messages?$select=id,subject,createdDateTime&$top=20&$orderby=createdDateTime desc',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        for (const draft of data.value ?? []) {
          const ageHours = (Date.now() - new Date(draft.createdDateTime).getTime()) / (1000 * 60 * 60);
          if (ageHours > 48) {
            const hash = `draft-avoidance-${draft.id}`;
            await supabase.from('tkg_signals').insert({
              user_id: userId, source: 'proactive_scan', source_id: draft.id,
              type: 'draft_avoidance',
              content: `Unsent draft (${Math.floor(ageHours / 24)} days old): "${draft.subject ?? '(no subject)'}"`,
              content_hash: hash, author: 'foldera-scanner',
              occurred_at: new Date().toISOString(), processed: true,
            }).then(({ error }) => { if (!error) found++; });
          }
        }
      }
    }
  } catch { /* silent */ }

  // Gmail drafts
  try {
    const { google } = await import('googleapis');
    const { getGoogleTokens } = await import('@/lib/auth/token-store');
    const tokens = await getGoogleTokens(userId);
    if (tokens) {
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });

      const list = await gmail.users.drafts.list({ userId: 'me', maxResults: 20 });
      for (const draft of list.data.drafts ?? []) {
        if (!draft.id) continue;
        try {
          const d = await gmail.users.drafts.get({ userId: 'me', id: draft.id, format: 'metadata' });
          const headers = d.data.message?.payload?.headers ?? [];
          const dateStr = headers.find(h => h.name?.toLowerCase() === 'date')?.value;
          const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value ?? '(no subject)';
          if (dateStr) {
            const ageHours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
            if (ageHours > 48) {
              const hash = `draft-avoidance-gmail-${draft.id}`;
              await supabase.from('tkg_signals').insert({
                user_id: userId, source: 'proactive_scan', source_id: draft.id,
                type: 'draft_avoidance',
                content: `Unsent Gmail draft (${Math.floor(ageHours / 24)} days old): "${subject}"`,
                content_hash: hash, author: 'foldera-scanner',
                occurred_at: new Date().toISOString(), processed: true,
              }).then(({ error }) => { if (!error) found++; });
            }
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* silent */ }

  return found;
}
