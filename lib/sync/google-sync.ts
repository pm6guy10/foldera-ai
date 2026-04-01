/**
 * google-sync.ts
 *
 * Background sync job: pulls Gmail messages, Google Calendar events, and
 * Google Drive files into tkg_signals. On first connect (last_synced_at is
 * null), pulls the last year. On subsequent runs, pulls since last_synced_at.
 *
 * Deduplication via content_hash prevents duplicate signals.
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { createServerClient } from '@/lib/db/client';
import { getUserToken, updateSyncTimestamp, saveUserToken } from '@/lib/auth/user-tokens';
import { encrypt } from '@/lib/encryption';
import { createHash } from 'crypto';
import mammoth from 'mammoth';
import { FIRST_SYNC_LOOKBACK_MS } from '@/lib/config/constants';
import {
  persistCalendarRsvpAvoidanceSignals,
  persistResponsePatternSignals,
  type CalendarIntelEvent,
  type MailIntelMessage,
} from '@/lib/sync/derive-mail-intelligence';

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function getOAuth2Client(
  userId: string,
  tokens: { access_token: string; refresh_token: string; expires_at: number },
) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    // expires_at is in seconds; expiry_date is in ms
    expiry_date: tokens.expires_at * 1000,
  });

  // Persist refreshed tokens back to user_tokens when googleapis auto-refreshes
  oauth2.on('tokens', async (newCredentials) => {
    try {
      await saveUserToken(userId, 'google', {
        access_token: newCredentials.access_token ?? tokens.access_token,
        refresh_token: newCredentials.refresh_token ?? tokens.refresh_token,
        expires_at: newCredentials.expiry_date
          ? Math.floor(newCredentials.expiry_date / 1000)
          : tokens.expires_at,
      });
      console.log(`[google-sync] Persisted refreshed Google tokens for user ${userId}`);
    } catch (err: any) {
      console.error(`[google-sync] Failed to persist refreshed tokens:`, err.message);
    }
  });

  return oauth2;
}

// ── Gmail Sync ─────────────────────────────────────────────────────────────

const GMAIL_PAGE_SIZE = 500;
const GMAIL_MAX_MESSAGES = 5000; // ~2-5 years depending on volume
const GMAIL_BODY_PREVIEW_MAX = 500;
const GMAIL_THREAD_FETCH_CAP = 300;

function getGmailHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function extractPlainTextFromGmailPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  maxLen: number,
): string {
  if (!part || maxLen <= 0) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    try {
      const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
      const buf = Buffer.from(b64, 'base64');
      return buf.toString('utf8').slice(0, maxLen);
    } catch {
      return '';
    }
  }
  if (part.parts) {
    for (const p of part.parts) {
      const t = extractPlainTextFromGmailPart(p, maxLen);
      if (t) return t.slice(0, maxLen);
    }
  }
  return '';
}

async function syncGmail(
  userId: string,
  oauth2: ReturnType<typeof getOAuth2Client>,
  sinceMs: number,
): Promise<number> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const afterSec = Math.floor(sinceMs / 1000);

  const messageRefs: Array<{ id?: string | null; threadId?: string | null }> = [];
  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${afterSec}`,
      maxResults: GMAIL_PAGE_SIZE,
      pageToken,
    });
    messageRefs.push(...(list.data.messages ?? []));
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken && messageRefs.length < GMAIL_MAX_MESSAGES);

  if (messageRefs.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;
  const intelMessages: MailIntelMessage[] = [];
  const threadSizeCache = new Map<string, number>();
  let threadFetchBudget = GMAIL_THREAD_FETCH_CAP;

  const threadMessageCount = async (threadId: string): Promise<number | undefined> => {
    if (threadSizeCache.has(threadId)) return threadSizeCache.get(threadId);
    if (threadFetchBudget <= 0) return undefined;
    threadFetchBudget--;
    try {
      const t = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata' });
      const n = t.data.messages?.length ?? 0;
      threadSizeCache.set(threadId, n);
      return n;
    } catch {
      return undefined;
    }
  };

  for (const { id, threadId } of messageRefs) {
    if (!id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const headers = msg.data.payload?.headers ?? [];
      const get = (name: string) => getGmailHeader(headers, name);

      const snippet = (msg.data.snippet ?? '').slice(0, GMAIL_BODY_PREVIEW_MAX);
      const bodyFromPart = extractPlainTextFromGmailPart(msg.data.payload ?? undefined, GMAIL_BODY_PREVIEW_MAX);
      const bodyPreview = (bodyFromPart || snippet).slice(0, GMAIL_BODY_PREVIEW_MAX).replace(/\s+/g, ' ').trim();

      const from = get('From');
      const to = get('To');
      const cc = get('Cc');
      const subject = get('Subject') || '(no subject)';
      const date = get('Date');
      const messageId = get('Message-ID');
      const inReplyTo = get('In-Reply-To');
      const references = get('References');
      const importance = get('X-Priority') || get('Importance') || '';
      const labelIds = msg.data.labelIds ?? [];

      const isSent = labelIds.includes('SENT');
      const signalType = isSent ? 'email_sent' : 'email_received';

      const hasReplyHeaders = Boolean(inReplyTo.trim() || references.trim());
      let threadLen: number | undefined;
      if (threadId) {
        threadLen = await threadMessageCount(threadId);
      }

      const lines = isSent
        ? [
            `[Sent email: ${date}]`,
            `To: ${to}`,
            `Subject: ${subject}`,
            cc ? `Cc: ${cc}` : '',
            `Body preview: ${bodyPreview}`,
            `Has In-Reply-To or References: ${hasReplyHeaders ? 'yes' : 'no'}`,
            typeof threadLen === 'number' ? `Thread messages (conversation): ${threadLen}` : '',
            importance ? `Priority/importance: ${importance}` : '',
          ]
        : [
            `[Email received: ${date}]`,
            `From: ${from}`,
            `To: ${to}`,
            cc ? `Cc: ${cc}` : '',
            `Subject: ${subject}`,
            `Body preview: ${bodyPreview}`,
            `Has In-Reply-To or References: ${hasReplyHeaders ? 'yes' : 'no'}`,
            typeof threadLen === 'number' ? `Thread messages (conversation): ${threadLen}` : '',
            importance ? `Priority/importance: ${importance}` : '',
          ];

      const content = lines.filter(Boolean).join('\n');

      const senderEmail = (isSent ? to : from).toLowerCase().trim().replace(/.*<([^>]+)>.*/, '$1');
      const normalizedSubject = subject.toLowerCase().trim();
      const datePrefix = date ? new Date(date).toISOString().slice(0, 10) : '';
      const contentHash = hash(`email:${senderEmail}|${normalizedSubject}|${datePrefix}`);

      const { error } = await supabase.from('tkg_signals').upsert({
        user_id: userId,
        source: 'gmail',
        source_id: id,
        type: signalType,
        content: encrypt(content),
        content_hash: contentHash,
        author: isSent ? 'self' : from,
        occurred_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        processed: false,
      }, { onConflict: 'user_id,content_hash', ignoreDuplicates: true });

      if (!error) inserted++;

      const dateMs = date ? new Date(date).getTime() : Date.now();
      if (Number.isFinite(dateMs)) {
        intelMessages.push({
          id,
          isSent,
          fromRaw: from,
          toRaw: to,
          ccRaw: cc,
          subject,
          dateMs,
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || undefined,
          references: references || undefined,
        });
      }
    } catch (msgErr: unknown) {
      const isDuplicate =
        msgErr instanceof Error && msgErr.message?.includes('duplicate');
      if (!isDuplicate) {
        console.warn(`[google-sync] Failed to persist message for user ${userId}:`, msgErr instanceof Error ? msgErr.message : String(msgErr));
      }
    }
  }

  try {
    const derived = await persistResponsePatternSignals(supabase, userId, 'gmail', intelMessages);
    if (derived > 0) {
      console.log(`[google-sync] user=${userId} response_pattern signals: ${derived}`);
    }
  } catch (e) {
    console.warn(`[google-sync] response_pattern derivation failed for ${userId}:`, e instanceof Error ? e.message : String(e));
  }

  return inserted;
}

// ── Calendar Sync ──────────────────────────────────────────────────────────

async function syncCalendar(
  userId: string,
  oauth2: ReturnType<typeof getOAuth2Client>,
  sinceMs: number,
  selfEmailLower: string,
): Promise<number> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const timeMin = new Date(sinceMs).toISOString();
  const timeMax = new Date().toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: 250,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items ?? [];
  if (events.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;
  const intelEvents: CalendarIntelEvent[] = [];

  for (const event of events) {
    if (!event.id) continue;

    const start = event.start?.dateTime ?? event.start?.date ?? '';
    const end = event.end?.dateTime ?? event.end?.date ?? '';
    const summary = event.summary ?? '(no title)';
    const organizer = event.organizer?.email ?? '';
    const creatorEmail = event.creator?.email ?? '';
    const isRecurring = Boolean(event.recurringEventId || (event.recurrence && event.recurrence.length > 0));
    const createdBySelf =
      selfEmailLower !== '' &&
      creatorEmail.toLowerCase() === selfEmailLower;

    const attendeeLines = (event.attendees ?? []).map((a) => {
      const email = a.email ?? '';
      const rs = a.responseStatus ?? '';
      return email ? `${email} (${rs})` : '';
    }).filter(Boolean);
    const attendeesFlat = (event.attendees ?? [])
      .map((a) => ({
        email: a.email ?? '',
        responseStatus: a.responseStatus ?? undefined,
      }))
      .filter((a) => a.email);

    let selfResponse = '';
    if (selfEmailLower) {
      const me = attendeesFlat.find((a) => a.email.toLowerCase() === selfEmailLower);
      selfResponse = me?.responseStatus ?? '';
    }

    const status = event.status ?? '';
    const isAllDay = !event.start?.dateTime;
    const desc = event.description ? event.description.slice(0, 500) : '';

    const content = [
      `[Calendar event: ${summary}]`,
      `Start: ${start}`,
      `End: ${end}`,
      isAllDay ? 'All day event' : '',
      organizer ? `Organizer: ${organizer}` : '',
      creatorEmail ? `Created by: ${creatorEmail}` : '',
      `Created by you: ${createdBySelf ? 'yes' : 'no'}`,
      `Recurring: ${isRecurring ? 'yes' : 'no'}`,
      attendeeLines.length ? `Attendees: ${attendeeLines.join('; ')}` : '',
      selfResponse ? `Your response: ${selfResponse}` : '',
      status ? `Event status: ${status}` : '',
      desc ? `Description: ${desc}` : '',
    ].filter(Boolean).join('\n');

    const contentHash = hash(`gcal:${event.id}`);

    const { error } = await supabase.from('tkg_signals').upsert({
      user_id: userId,
      source: 'google_calendar',
      source_id: event.id,
      type: 'calendar_event',
      content: encrypt(content),
      content_hash: contentHash,
      author: organizer || 'self',
      occurred_at: start ? new Date(start).toISOString() : new Date().toISOString(),
      processed: false,
    }, { onConflict: 'user_id,content_hash', ignoreDuplicates: true });

    if (!error) inserted++;

    intelEvents.push({
      id: event.id,
      summary,
      startIso: start,
      organizerEmail: organizer,
      selfEmailLower,
      attendees: attendeesFlat,
      isRecurring,
      createdBySelf,
    });
  }

  try {
    const rsvp = await persistCalendarRsvpAvoidanceSignals(supabase, userId, 'google_calendar', intelEvents);
    if (rsvp > 0) {
      console.log(`[google-sync] user=${userId} calendar RSVP-avoidance signals: ${rsvp}`);
    }
  } catch (e) {
    console.warn(`[google-sync] calendar RSVP derivation failed for ${userId}:`, e instanceof Error ? e.message : String(e));
  }

  return inserted;
}

// ── Google Drive Sync ─────────────────────────────────────────────────────

/**
 * MIME types we can export as plain text from Google Workspace apps.
 * For native Google formats we use the export endpoint; for binary uploads
 * stored in Drive (.docx, .txt, .md, .pdf) we download the raw content.
 */
const GOOGLE_NATIVE_MIME_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

const DRIVE_TEXT_EXTENSIONS = new Set(['.txt', '.md']);

function getDriveFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Download text content for a Google Drive file.
 * - Google Docs/Sheets: export as plain text via the export endpoint.
 * - .txt, .md: download raw content.
 * - .docx, .pdf: metadata only (binary parsing not available).
 */
const DOCX_MAX_PARSE_BYTES = 500 * 1024; // 500KB — skip larger files to avoid mammoth latency

async function downloadDriveFileContent(
  oauth2: ReturnType<typeof getOAuth2Client>,
  fileId: string,
  mimeType: string,
  fileName: string,
  fileSize?: number,
): Promise<string | null> {
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  try {
    // Google native format — export as text
    const exportMime = GOOGLE_NATIVE_MIME_MAP[mimeType];
    if (exportMime) {
      const res = await drive.files.export(
        { fileId, mimeType: exportMime },
        { responseType: 'text' },
      );
      const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      return text.slice(0, 1500);
    }

    const ext = getDriveFileExtension(fileName);

    // Word documents — download binary and extract text with mammoth
    // Skip large files to prevent blocking sync for 30+ seconds
    if (ext === '.docx') {
      if (fileSize && fileSize > DOCX_MAX_PARSE_BYTES) return null;
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim().slice(0, 1500);
    }

    // Plain text files stored in Drive — download directly
    if (DRIVE_TEXT_EXTENSIONS.has(ext)) {
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' },
      );
      const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      return text.slice(0, 1500);
    }
  } catch {
    // Content download failed — fall through to metadata-only
  }

  return null;
}

/**
 * Sync Google Drive files modified in the lookback window.
 * Queries for files the user owns or has edited, filtered to supported types.
 */
async function syncDrive(
  userId: string,
  oauth2: ReturnType<typeof getOAuth2Client>,
  sinceMs: number,
): Promise<number> {
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  const sinceIso = new Date(sinceMs).toISOString();

  // Query for Google Docs, Sheets, and supported binary uploads
  const mimeQueries = [
    "mimeType = 'application/vnd.google-apps.document'",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    "mimeType = 'text/plain'",
    "mimeType = 'text/markdown'",
    "mimeType = 'application/pdf'",
  ];

  const query = `(${mimeQueries.join(' or ')}) and modifiedTime >= '${sinceIso}' and trashed = false`;

  let allFiles: any[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, owners, size, webViewLink)',
        pageSize: 200,
        orderBy: 'modifiedTime desc',
        pageToken,
      });

      const files = res.data.files ?? [];
      allFiles.push(...files);
      pageToken = res.data.nextPageToken ?? undefined;

      if (allFiles.length >= 500) break; // cap
    } while (pageToken);
  } catch (err: any) {
    // drive.readonly may not be granted yet — non-fatal
    if (err.code === 403 || err.message?.includes('insufficientPermissions')) {
      console.warn('[google-sync] drive.readonly scope not granted, skipping drive sync');
      return 0;
    }
    throw err;
  }

  if (allFiles.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const file of allFiles) {
    if (!file.id) continue;

    try {
      const owner = file.owners?.[0]?.displayName ?? 'self';
      const mimeType = file.mimeType ?? '';
      const fileName = file.name ?? '(untitled)';

      // Download text content when possible
      let fileContentSnippet = '';
      const textContent = await downloadDriveFileContent(oauth2, file.id, mimeType, fileName, file.size ? Number(file.size) : undefined);
      if (textContent) {
        fileContentSnippet = `\nContent: ${textContent}`;
      }

      const content = [
        `[File: ${fileName}]`,
        `Type: ${mimeType}`,
        `Modified: ${file.modifiedTime}`,
        `Owner: ${owner}`,
        file.size ? `Size: ${Math.round(Number(file.size) / 1024)}KB` : '',
        file.webViewLink ? `URL: ${file.webViewLink}` : '',
      ]
        .filter(Boolean)
        .join('\n') + fileContentSnippet;

      const contentHash = hash(`gdrive:${file.id}:${file.modifiedTime}`);

      const { error } = await supabase.from('tkg_signals').upsert({
        user_id: userId,
        source: 'drive',
        source_id: file.id,
        type: 'file_modified',
        content: encrypt(content),
        content_hash: contentHash,
        author: owner,
        occurred_at: file.modifiedTime ?? new Date().toISOString(),
        processed: false,
      }, { onConflict: 'user_id,content_hash', ignoreDuplicates: true });

      if (!error) inserted++;
    } catch (fileErr: unknown) {
      console.warn(`[google-sync] Failed to persist Drive file for user ${userId}:`, fileErr instanceof Error ? fileErr.message : String(fileErr));
    }
  }

  return inserted;
}

// ── Main Sync Entry Point ──────────────────────────────────────────────────

export interface GoogleSyncResult {
  gmail_signals: number;
  calendar_signals: number;
  drive_signals: number;
  is_first_sync: boolean;
  error?: string;
}

/**
 * Run Google sync for a user. On first connect (no last_synced_at),
 * pulls 90 days. On subsequent runs, pulls since last sync.
 */
export async function syncGoogle(userId: string, options?: { maxLookbackMs?: number }): Promise<GoogleSyncResult> {
  const token = await getUserToken(userId, 'google');
  if (!token) {
    return { gmail_signals: 0, calendar_signals: 0, drive_signals: 0, is_first_sync: false, error: 'no_token' };
  }

  const supabase = createServerClient();
  const { data: scopeRow } = await supabase
    .from('user_tokens')
    .select('scopes')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();

  const grantedScopes: string[] = (scopeRow?.scopes ?? '')
    .split(/\s+/)
    .map((scope: string) => scope.trim())
    .filter(Boolean);
  const scopes = grantedScopes.length > 0 ? grantedScopes.join(', ') : '(none)';
  console.log('[google-sync] Granted scopes:', scopes);

  const hasCalendarScope = grantedScopes.some((scope) => scope.includes('calendar'));
  const hasDriveScope = grantedScopes.some((scope) => scope.includes('drive'));

  if (!hasCalendarScope) {
    console.warn('[google-sync] Missing scope: calendar.readonly');
  }

  if (!hasDriveScope) {
    console.warn('[google-sync] Missing scope: drive.readonly');
  }

  const isFirstSync = !token.last_synced_at;
  const sinceMs = isFirstSync
    ? Date.now() - (options?.maxLookbackMs ?? FIRST_SYNC_LOOKBACK_MS)
    : new Date(token.last_synced_at!).getTime();

  const oauth2 = getOAuth2Client(userId, token);

  let gmailSignals = 0;
  let calendarSignals = 0;
  let driveSignals = 0;
  const errors: string[] = [];

  let googleSelfEmail = '';
  if (hasCalendarScope) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });
      const prof = await gmail.users.getProfile({ userId: 'me' });
      googleSelfEmail = (prof.data.emailAddress ?? '').toLowerCase().trim();
    } catch {
      /* optional */
    }
  }

  try {
    gmailSignals = await syncGmail(userId, oauth2, sinceMs);
  } catch (err: any) {
    console.error('[google-sync] Gmail sync failed:', err.message);
    errors.push(`gmail: ${err.message}`);
  }

  try {
    calendarSignals = await syncCalendar(userId, oauth2, sinceMs, googleSelfEmail);
  } catch (err: any) {
    console.error('[google-sync] Calendar sync failed:', err.message);
    errors.push(`calendar: ${err.message}`);
  }

  try {
    driveSignals = await syncDrive(userId, oauth2, sinceMs);
  } catch (err: any) {
    console.error('[google-sync] Drive sync failed:', err.message);
    errors.push(`drive: ${err.message}`);
  }

  // Only advance sync timestamp when ALL sub-syncs succeeded.
  // If any sub-sync failed, keep the old timestamp so the next run retries
  // the same window. Dedup via content_hash prevents duplicate signals.
  // This prevents the Class C data loss pattern (partial success advancing
  // the timestamp past failed sub-syncs' data windows).
  if (errors.length === 0) {
    await updateSyncTimestamp(userId, 'google');
  } else {
    console.warn(
      `[google-sync] user=${userId} timestamp NOT advanced due to ${errors.length} sub-sync error(s): ${errors.join('; ')}`,
    );
  }

  console.log(
    `[google-sync] user=${userId} first=${isFirstSync} gmail=${gmailSignals} calendar=${calendarSignals} drive=${driveSignals}` +
    (errors.length > 0 ? ` errors=[${errors.join('; ')}]` : ''),
  );

  return {
    gmail_signals: gmailSignals,
    calendar_signals: calendarSignals,
    drive_signals: driveSignals,
    is_first_sync: isFirstSync,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
