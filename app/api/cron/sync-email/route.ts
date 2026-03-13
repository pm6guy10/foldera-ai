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
import { resolveCronUser } from '@/lib/auth/resolve-user';
import { createServerClient }          from '@/lib/db/client';
import { fetchOutlookEmails }          from '@/lib/integrations/outlook-client';
import { fetchGmailEmails }            from '@/lib/integrations/gmail-client';
import { syncOutlookCalendar }         from '@/lib/integrations/outlook-calendar';
import { extractFromConversation }     from '@/lib/extraction/conversation-extractor';
import { analyzeRelationships }        from '@/lib/relationships/tracker';
import { encrypt }                     from '@/lib/encryption';

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
  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

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

  // ── Outlook calendar sync ────────────────────────────────────────────────
  let calendarEvents = 0;
  try {
    calendarEvents = await syncOutlookCalendar(userId);
  } catch (calErr: any) {
    console.warn('[sync-email] calendar sync failed:', calErr.message);
  }

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

  // ── Close outcome loops: detect replies, update Bayesian metrics ───────────
  let outcomesClosed = 0;
  try {
    outcomesClosed = await closeOutcomeLoops(userId);
  } catch (loopErr: any) {
    console.warn('[sync-email] outcome loop close failed:', loopErr.message);
  }

  // ── Engagement drop: flag if user hasn't opened daily brief in 3+ days ─────
  try {
    await checkEngagementDrop(userId);
  } catch (engErr: any) {
    console.warn('[sync-email] engagement drop check failed:', engErr.message);
  }

  console.log(
    '[sync-email] done —',
    results.map(r => `${r.source}: ${r.emails} emails → ${r.decisions} decisions${r.error ? ` (err: ${r.error})` : ''}`).join(' | '),
    `| calendar: ${calendarEvents} | drafts flagged: ${draftsFound} | relationships: ${relationshipsAnalyzed} | outcomes closed: ${outcomesClosed}`,
  );

  return NextResponse.json({
    ok: true,
    signals:   totalSignals,
    decisions: totalDecisions,
    sources:   results,
    calendar_events: calendarEvents,
    drafts_flagged: draftsFound,
    relationships_analyzed: relationshipsAnalyzed,
    outcomes_closed: outcomesClosed,
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
              content: encrypt(`Unsent draft (${Math.floor(ageHours / 24)} days old): "${draft.subject ?? '(no subject)'}"`) ,
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
                content: encrypt(`Unsent Gmail draft (${Math.floor(ageHours / 24)} days old): "${subject}"`),
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

// ---------------------------------------------------------------------------
// Outcome loops: detect replies to Foldera-sent emails, update Bayesian metrics
// ---------------------------------------------------------------------------

/** Fetch inbox subject lines for the last 7 days from all connected providers. */
async function getInboundSubjects(userId: string): Promise<Set<string>> {
  const subjects = new Set<string>();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Outlook inbox
  try {
    const { getMicrosoftTokens } = await import('@/lib/auth/token-store');
    const tokens = await getMicrosoftTokens(userId);
    if (tokens) {
      const since = new Date(Date.now() - sevenDaysMs).toISOString();
      const url =
        `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages` +
        `?$filter=receivedDateTime ge ${since}&$select=subject&$top=50`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.value ?? []) {
          if (m.subject) subjects.add((m.subject as string).toLowerCase().trim());
        }
      }
    }
  } catch { /* silent */ }

  // Gmail inbox
  try {
    const { google } = await import('googleapis');
    const { getGoogleTokens } = await import('@/lib/auth/token-store');
    const tokens = await getGoogleTokens(userId);
    if (tokens) {
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const afterSec = Math.floor((Date.now() - sevenDaysMs) / 1000);
      const list = await gmail.users.messages.list({ userId: 'me', q: `in:inbox after:${afterSec}`, maxResults: 50 });
      for (const { id } of list.data.messages ?? []) {
        if (!id) continue;
        try {
          const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject'] });
          const subj = msg.data.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject')?.value;
          if (subj) subjects.add((subj as string).toLowerCase().trim());
        } catch { /* skip */ }
      }
    }
  } catch { /* silent */ }

  return subjects;
}

interface InboundEmail { subject: string; bodySnippet: string; receivedAt: string; }
interface SentEmail    { to: string; subject: string; bodySnippet: string; sentAt: string; }

/** Jaccard word-overlap similarity — 0..1. */
function wordSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const A = tok(a), B = tok(b);
  if (A.size === 0 && B.size === 0) return 1;
  const intersection = [...A].filter(w => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 1 : intersection / union;
}

/** Structured sent mail for artifact outcome matching (to/subject/body). */
async function getSentEmailsStructured(userId: string, sinceIso: string): Promise<SentEmail[]> {
  const emails: SentEmail[] = [];

  // Outlook
  try {
    const { getMicrosoftTokens } = await import('@/lib/auth/token-store');
    const tokens = await getMicrosoftTokens(userId);
    if (tokens) {
      const url =
        `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages` +
        `?$filter=sentDateTime ge ${sinceIso}` +
        `&$select=id,subject,bodyPreview,toRecipients,sentDateTime&$top=50`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.value ?? []) {
          const to = (m.toRecipients ?? [])
            .map((r: any) => r.emailAddress?.address ?? '')
            .filter(Boolean)
            .join(',');
          emails.push({ to, subject: m.subject ?? '', bodySnippet: m.bodyPreview ?? '', sentAt: m.sentDateTime ?? '' });
        }
      }
    }
  } catch { /* silent */ }

  // Gmail
  try {
    const { google } = await import('googleapis');
    const { getGoogleTokens } = await import('@/lib/auth/token-store');
    const tokens = await getGoogleTokens(userId);
    if (tokens) {
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const afterSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const list = await gmail.users.messages.list({ userId: 'me', q: `in:sent after:${afterSec}`, maxResults: 50 });
      for (const { id } of list.data.messages ?? []) {
        if (!id) continue;
        try {
          const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'To', 'Date'] });
          const headers = msg.data.payload?.headers ?? [];
          const get = (n: string) => headers.find((h: any) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? '';
          const toEmails = (get('To').match(/[\w.+-]+@[\w.-]+/g) ?? []).join(',');
          emails.push({ to: toEmails, subject: get('Subject'), bodySnippet: msg.data.snippet ?? '', sentAt: get('Date') });
        } catch { /* skip */ }
      }
    }
  } catch { /* silent */ }

  return emails;
}

/**
 * Fetch subject + body snippet of inbox emails received since `sinceIso`.
 * Used to detect YES/NO replies to Foldera outcome-check emails.
 */
async function getInboundEmailsSince(userId: string, sinceIso: string): Promise<InboundEmail[]> {
  const emails: InboundEmail[] = [];

  // Outlook
  try {
    const { getMicrosoftTokens } = await import('@/lib/auth/token-store');
    const tokens = await getMicrosoftTokens(userId);
    if (tokens) {
      const url =
        `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages` +
        `?$filter=receivedDateTime ge ${sinceIso}` +
        `&$select=subject,bodyPreview,receivedDateTime&$top=50`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        for (const m of data.value ?? []) {
          emails.push({
            subject:     (m.subject as string) ?? '',
            bodySnippet: (m.bodyPreview as string) ?? '',
            receivedAt:  (m.receivedDateTime as string) ?? '',
          });
        }
      }
    }
  } catch { /* silent */ }

  // Gmail
  try {
    const { google } = await import('googleapis');
    const { getGoogleTokens } = await import('@/lib/auth/token-store');
    const tokens = await getGoogleTokens(userId);
    if (tokens) {
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: tokens.expiry_date });
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const afterSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const list = await gmail.users.messages.list({ userId: 'me', q: `in:inbox after:${afterSec}`, maxResults: 50 });
      for (const { id } of list.data.messages ?? []) {
        if (!id) continue;
        try {
          const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'Date'] });
          const headers = msg.data.payload?.headers ?? [];
          const subj    = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value ?? '';
          const dateStr = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value ?? '';
          emails.push({
            subject:     subj,
            bodySnippet: msg.data.snippet ?? '',
            receivedAt:  dateStr,
          });
        } catch { /* skip */ }
      }
    }
  } catch { /* silent */ }

  return emails;
}

/**
 * For each executed send_message action without an outcome:
 * - If an inbound "Re: <subject>" is found → success → increment successful_outcomes
 * - If 7 days passed with no reply → failure → increment failed_outcomes
 * Marks action outcome_closed in execution_result so it isn't reprocessed.
 */
async function closeOutcomeLoops(userId: string): Promise<number> {
  const supabase = createServerClient();
  let closed = 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sentActions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, generated_at, execution_result')
    .eq('user_id', userId)
    .eq('status', 'executed')
    .eq('action_type', 'send_message')
    .gte('generated_at', thirtyDaysAgo);

  if (!sentActions || sentActions.length === 0) return 0;

  // Only process actions that sent successfully and haven't been outcome-closed yet
  const pending = sentActions.filter((a: any) => {
    const er = (a.execution_result as Record<string, any>) ?? {};
    return !er.outcome_closed && er.sent === true;
  });

  if (pending.length === 0) return 0;

  // Fetch both inbound subjects (reply detection) and structured sent mail (artifact matching)
  const [inboundSubjects, sentEmails] = await Promise.all([
    getInboundSubjects(userId),
    getSentEmailsStructured(userId, thirtyDaysAgo),
  ]);

  for (const action of pending) {
    const execResult  = (action.execution_result as Record<string, any>) ?? {};
    const artifact    = execResult.artifact as Record<string, any> | undefined;
    const artifactTo  = ((artifact?.to  as string) ?? '').toLowerCase();
    const artifactSubj = ((artifact?.subject as string) ?? '').toLowerCase().trim();
    const artifactBody = (artifact?.body as string) ?? '';

    const generatedAt        = new Date(action.generated_at).getTime();
    const fortyEightHoursAfter = generatedAt + 48 * 60 * 60 * 1000;

    // ── 1. Sent-folder match: did user send a matching email within 48h? ──────
    let sentMatch: SentEmail | undefined;
    let isModified = false;

    if (artifactTo || artifactSubj) {
      const artifactToEmail = (artifactTo.match(/[\w.+-]+@[\w.-]+/) ?? [])[0] ?? artifactTo;
      sentMatch = sentEmails.find(sent => {
        const sentTime = new Date(sent.sentAt).getTime();
        if (isNaN(sentTime) || sentTime < generatedAt || sentTime > fortyEightHoursAfter) return false;
        const recipientMatch = artifactToEmail && sent.to.toLowerCase().includes(artifactToEmail);
        const subjectSim     = wordSimilarity(artifactSubj, sent.subject);
        return recipientMatch || subjectSim >= 0.4;
      });

      if (sentMatch) {
        const subjectSim = wordSimilarity(artifactSubj, sentMatch.subject);
        const bodySim    = artifactBody.length > 50
          ? wordSimilarity(artifactBody.slice(0, 500), sentMatch.bodySnippet)
          : 1;
        // "Modified" = both subject AND body changed significantly
        isModified = subjectSim < 0.5 && bodySim < 0.5;
      }
    }

    // ── 2. Fall back: inbound reply detection ─────────────────────────────────
    const hasReply = artifactSubj
      ? inboundSubjects.has(`re: ${artifactSubj}`) || inboundSubjects.has(artifactSubj)
      : false;

    const isStale = action.generated_at < sevenDaysAgo;

    // Outcome determinable only if we found a sent match, a reply, or 7 days elapsed
    if (!sentMatch && !hasReply && !isStale) continue;

    // ── 3. Determine outcome ──────────────────────────────────────────────────
    let outcome: string;
    if (sentMatch) {
      outcome = isModified ? 'successful_outcome_modified' : 'successful_outcome';
    } else if (hasReply) {
      outcome = 'successful_outcome';
    } else {
      outcome = 'failed_outcome'; // 7 days — no evidence of use
    }
    const isSuccess = outcome.startsWith('successful');

    const domain      = (execResult.domain as string) ?? 'general';
    const patternHash = `send_message:${domain}`;

    try {
      const { data: pm } = await supabase
        .from('tkg_pattern_metrics')
        .select('total_activations, successful_outcomes, failed_outcomes')
        .eq('user_id', userId)
        .eq('pattern_hash', patternHash)
        .maybeSingle();

      await supabase.from('tkg_pattern_metrics').upsert(
        {
          user_id:             userId,
          pattern_hash:        patternHash,
          category:            'send_message',
          domain,
          total_activations:   pm?.total_activations   ?? 0,
          successful_outcomes: (pm?.successful_outcomes ?? 0) + (isSuccess ? 1 : 0),
          failed_outcomes:     (pm?.failed_outcomes     ?? 0) + (isSuccess ? 0 : 1),
          updated_at:          new Date().toISOString(),
        },
        { onConflict: 'user_id,pattern_hash' },
      );
    } catch (pmErr: any) {
      console.warn('[sync-email/closeOutcomeLoops] metrics upsert failed:', pmErr.message);
    }

    await supabase
      .from('tkg_actions')
      .update({
        execution_result: {
          ...execResult,
          outcome_closed:    true,
          outcome,
          outcome_modified:  isModified || undefined,
          outcome_closed_at: new Date().toISOString(),
        },
      })
      .eq('id', action.id);

    const detail = sentMatch
      ? `sent-folder match${isModified ? ' (modified)' : ''}`
      : hasReply ? 'reply detected' : '7d elapsed';
    console.log(`[sync-email/closeOutcomeLoops] ${action.id} → ${outcome} (${detail})`);
    closed++;
  }

  // ── YES/NO reply detection for non-email outcome checks ───────────────────
  // Covers directives that had "Reply YES or NO." appended to the daily email.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: checkActions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, execution_result')
    .eq('user_id', userId)
    .eq('status', 'executed')
    .neq('action_type', 'send_message') // handled above
    .gte('executed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const pendingChecks = (checkActions ?? []).filter((a: any) => {
    const er = (a.execution_result as Record<string, any>) ?? {};
    return er.outcome_check_sent === true && !er.outcome_closed;
  });

  if (pendingChecks.length > 0) {
    // Fetch inbox emails since the earliest check was sent
    const earliestCheckAt = pendingChecks.reduce((min: string, a: any) => {
      const t = (a.execution_result as Record<string, any>).outcome_check_sent_at as string ?? '';
      return t < min ? t : min;
    }, new Date().toISOString());

    const inboundEmails = await getInboundEmailsSince(userId, earliestCheckAt);

    for (const action of pendingChecks) {
      const execResult      = (action.execution_result as Record<string, any>) ?? {};
      const checkSentAt     = (execResult.outcome_check_sent_at as string) ?? '';
      const isAutoCloseTime = checkSentAt < fiveDaysAgo;

      // Look for a YES or NO reply received after the check was sent
      const yesNoReply = inboundEmails.find(email => {
        if (email.receivedAt && email.receivedAt < checkSentAt) return false;
        const snippet = email.bodySnippet.trim().toLowerCase();
        return /^(yes|no)[\s.,!?]*$/.test(snippet);
      });

      if (!yesNoReply && !isAutoCloseTime) continue; // not yet determinable

      const isYes    = yesNoReply ? /^yes/i.test(yesNoReply.bodySnippet.trim()) : null;
      const outcome  = isYes === null ? 'neutral' : (isYes ? 'yes' : 'no');

      // Update pattern metrics (YES → success, NO → failure, neutral → no change)
      if (isYes !== null) {
        const domain      = (execResult.domain as string) ?? 'general';
        const patternHash = `${action.action_type}:${domain}`;
        try {
          const { data: pm } = await supabase
            .from('tkg_pattern_metrics')
            .select('total_activations, successful_outcomes, failed_outcomes')
            .eq('user_id', userId)
            .eq('pattern_hash', patternHash)
            .maybeSingle();

          await supabase.from('tkg_pattern_metrics').upsert(
            {
              user_id:             userId,
              pattern_hash:        patternHash,
              category:            action.action_type,
              domain,
              total_activations:   pm?.total_activations   ?? 0,
              successful_outcomes: (pm?.successful_outcomes ?? 0) + (isYes ? 1 : 0),
              failed_outcomes:     (pm?.failed_outcomes     ?? 0) + (isYes ? 0 : 1),
              updated_at:          new Date().toISOString(),
            },
            { onConflict: 'user_id,pattern_hash' },
          );
        } catch (pmErr: any) {
          console.warn('[sync-email/closeOutcomeLoops] YES/NO metrics upsert failed:', pmErr.message);
        }
      }

      await supabase
        .from('tkg_actions')
        .update({
          execution_result: {
            ...execResult,
            outcome_closed:    true,
            outcome,
            outcome_closed_at: new Date().toISOString(),
          },
        })
        .eq('id', action.id);

      console.log(`[sync-email/closeOutcomeLoops] ${action.id} YES/NO → ${outcome} (${isYes === null ? '5d auto-close' : 'reply detected'})`);
      closed++;
    }
  }

  return closed;
}

// ---------------------------------------------------------------------------
// Engagement drop: detect if user stopped opening the daily brief
// ---------------------------------------------------------------------------

/**
 * Checks tkg_signals for the most recent daily_brief_opened event.
 * If 3+ consecutive days without an open → increments failed_outcomes in
 * tkg_pattern_metrics (pattern_hash = 'daily_brief:engagement').
 * Runs at most once per day (guards on updated_at).
 * The briefing generator reads this to vary action_type mix or reduce frequency.
 */
async function checkEngagementDrop(userId: string): Promise<void> {
  const supabase   = createServerClient();
  const todayStr   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const patternHash = 'daily_brief:engagement';

  // Guard: already processed today
  const { data: existing } = await supabase
    .from('tkg_pattern_metrics')
    .select('id, successful_outcomes, failed_outcomes, updated_at')
    .eq('user_id', userId)
    .eq('pattern_hash', patternHash)
    .maybeSingle();

  if (existing?.updated_at && (existing.updated_at as string).slice(0, 10) === todayStr) return;

  // Fetch the most recent daily_brief_opened signal
  const { data: lastOpen } = await supabase
    .from('tkg_signals')
    .select('occurred_at')
    .eq('user_id', userId)
    .eq('type', 'daily_brief_opened')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const isDropping   = !lastOpen || (lastOpen.occurred_at as string) < threeDaysAgo;

  await supabase.from('tkg_pattern_metrics').upsert(
    {
      user_id:             userId,
      pattern_hash:        patternHash,
      category:            'engagement',
      domain:              'daily_brief',
      total_activations:   (existing?.successful_outcomes ?? 0) + (existing?.failed_outcomes ?? 0) + 1,
      successful_outcomes: (existing?.successful_outcomes ?? 0) + (isDropping ? 0 : 1),
      failed_outcomes:     (existing?.failed_outcomes     ?? 0) + (isDropping ? 1 : 0),
      updated_at:          new Date().toISOString(),
    },
    { onConflict: 'user_id,pattern_hash' },
  );

  if (isDropping) {
    const daysSince = lastOpen
      ? Math.floor((Date.now() - new Date(lastOpen.occurred_at as string).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    console.log(`[sync-email/checkEngagementDrop] engagement_drop flagged — last open ${daysSince != null ? `${daysSince}d ago` : 'never'}`);
  }
}
