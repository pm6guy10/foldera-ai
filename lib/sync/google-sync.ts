/**
 * google-sync.ts
 *
 * Background sync job: pulls Gmail messages and Google Calendar events
 * into tkg_signals. On first connect (last_synced_at is null), pulls
 * the last 30 days. On subsequent runs, pulls since last_synced_at.
 *
 * Deduplication via content_hash prevents duplicate signals.
 */

import { google } from 'googleapis';
import { createServerClient } from '@/lib/db/client';
import { getUserToken, updateSyncTimestamp, saveUserToken } from '@/lib/auth/user-tokens';
import { encrypt } from '@/lib/encryption';
import { createHash } from 'crypto';

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

async function syncGmail(
  userId: string,
  oauth2: ReturnType<typeof getOAuth2Client>,
  sinceMs: number,
): Promise<number> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const afterSec = Math.floor(sinceMs / 1000);

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: `after:${afterSec}`,
    maxResults: 200,
  });

  const messageIds = list.data.messages ?? [];
  if (messageIds.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const { id } of messageIds) {
    if (!id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date'],
      });

      const headers = msg.data.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const snippet = msg.data.snippet ?? '';
      const from = get('From');
      const to = get('To');
      const subject = get('Subject') || '(no subject)';
      const date = get('Date');
      const labelIds = msg.data.labelIds ?? [];

      const isSent = labelIds.includes('SENT');
      const signalType = isSent ? 'email_sent' : 'email_received';

      const content = isSent
        ? `[Sent email: ${date}]\nTo: ${to}\nSubject: ${subject}\nPreview: ${snippet}`
        : `[Email received: ${date}]\nFrom: ${from}\nSubject: ${subject}\nPreview: ${snippet}`;

      const contentHash = hash(`gmail:${id}`);

      const { error } = await supabase.from('tkg_signals').insert({
        user_id: userId,
        source: 'gmail',
        source_id: id,
        type: signalType,
        content: encrypt(content),
        content_hash: contentHash,
        author: isSent ? 'self' : from,
        occurred_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        processed: false,
      });

      if (!error) inserted++;
      // Duplicate hash → silently skip (expected on incremental syncs)
    } catch {
      // Skip individual message errors
    }
  }

  return inserted;
}

// ── Calendar Sync ──────────────────────────────────────────────────────────

async function syncCalendar(
  userId: string,
  oauth2: ReturnType<typeof getOAuth2Client>,
  sinceMs: number,
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

  for (const event of events) {
    if (!event.id) continue;

    const start = event.start?.dateTime ?? event.start?.date ?? '';
    const end = event.end?.dateTime ?? event.end?.date ?? '';
    const summary = event.summary ?? '(no title)';
    const organizer = event.organizer?.email ?? '';
    const attendees = (event.attendees ?? [])
      .map(a => a.email)
      .filter(Boolean)
      .join(', ');
    const status = event.status ?? '';
    const isAllDay = !event.start?.dateTime;

    const content = [
      `[Calendar event: ${summary}]`,
      `Start: ${start}`,
      `End: ${end}`,
      isAllDay ? 'All day event' : '',
      organizer ? `Organizer: ${organizer}` : '',
      attendees ? `Attendees: ${attendees}` : '',
      status ? `Status: ${status}` : '',
      event.description ? `Description: ${event.description.slice(0, 500)}` : '',
    ].filter(Boolean).join('\n');

    const contentHash = hash(`gcal:${event.id}`);

    const { error } = await supabase.from('tkg_signals').insert({
      user_id: userId,
      source: 'google_calendar',
      source_id: event.id,
      type: 'calendar_event',
      content: encrypt(content),
      content_hash: contentHash,
      author: organizer || 'self',
      occurred_at: start ? new Date(start).toISOString() : new Date().toISOString(),
      processed: false,
    });

    if (!error) inserted++;
  }

  return inserted;
}

// ── Main Sync Entry Point ──────────────────────────────────────────────────

export interface GoogleSyncResult {
  gmail_signals: number;
  calendar_signals: number;
  is_first_sync: boolean;
  error?: string;
}

/**
 * Run Google sync for a user. On first connect (no last_synced_at),
 * pulls 30 days. On subsequent runs, pulls since last sync.
 */
export async function syncGoogle(userId: string): Promise<GoogleSyncResult> {
  const token = await getUserToken(userId, 'google');
  if (!token) {
    return { gmail_signals: 0, calendar_signals: 0, is_first_sync: false, error: 'no_token' };
  }

  const isFirstSync = !token.last_synced_at;
  const sinceMs = isFirstSync
    ? Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
    : new Date(token.last_synced_at!).getTime();

  const oauth2 = getOAuth2Client(userId, token);

  let gmailSignals = 0;
  let calendarSignals = 0;
  const errors: string[] = [];

  try {
    gmailSignals = await syncGmail(userId, oauth2, sinceMs);
  } catch (err: any) {
    console.error('[google-sync] Gmail sync failed:', err.message);
    errors.push(`gmail: ${err.message}`);
  }

  try {
    calendarSignals = await syncCalendar(userId, oauth2, sinceMs);
  } catch (err: any) {
    console.error('[google-sync] Calendar sync failed:', err.message);
    errors.push(`calendar: ${err.message}`);
  }

  // Update last_synced_at even on partial success
  if (gmailSignals > 0 || calendarSignals > 0 || errors.length === 0) {
    await updateSyncTimestamp(userId, 'google');
  }

  console.log(
    `[google-sync] user=${userId} first=${isFirstSync} gmail=${gmailSignals} calendar=${calendarSignals}` +
    (errors.length > 0 ? ` errors=[${errors.join('; ')}]` : ''),
  );

  return {
    gmail_signals: gmailSignals,
    calendar_signals: calendarSignals,
    is_first_sync: isFirstSync,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
