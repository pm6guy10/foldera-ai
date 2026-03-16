/**
 * microsoft-sync.ts
 *
 * Background sync job: pulls Outlook mail, calendar events, OneDrive files,
 * and To Do tasks into tkg_signals via Microsoft Graph API.
 *
 * On first connect (last_synced_at is null), pulls the last 30 days.
 * On subsequent runs, pulls since last_synced_at.
 *
 * Deduplication via content_hash prevents duplicate signals.
 */

import { createServerClient } from '@/lib/db/client';
import { getUserToken, updateSyncTimestamp, saveUserToken } from '@/lib/auth/user-tokens';
import { encrypt } from '@/lib/encryption';
import { createHash } from 'crypto';

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const MS_TOKEN_SCOPES = 'openid profile email offline_access User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Tasks.Read';

/**
 * Refresh the Microsoft access token using the refresh_token from user_tokens,
 * then persist the new tokens back to user_tokens.
 */
async function refreshMicrosoftAccessToken(
  userId: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_at: number } | null> {
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MS_TOKEN_SCOPES,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`[microsoft-sync] Token refresh failed (${response.status}): ${errorBody.slice(0, 200)}`);
    return null;
  }

  const data = await response.json();
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  };

  // Persist refreshed tokens back to user_tokens
  await saveUserToken(userId, 'microsoft', newTokens);
  console.log(`[microsoft-sync] Refreshed and saved Microsoft tokens for user ${userId}`);
  return newTokens;
}

/**
 * Get a valid Microsoft access token from user_tokens, refreshing if expired.
 */
async function getValidMicrosoftToken(
  userId: string,
): Promise<{ access_token: string; refresh_token: string; expires_at: number } | null> {
  const token = await getUserToken(userId, 'microsoft');
  if (!token) return null;

  // Check if token needs refresh (5-minute buffer)
  const nowSec = Math.floor(Date.now() / 1000);
  if (token.expires_at && token.expires_at < nowSec + 5 * 60) {
    if (!token.refresh_token) {
      console.error('[microsoft-sync] No refresh token — user must re-authenticate');
      return null;
    }
    return refreshMicrosoftAccessToken(userId, token.refresh_token);
  }

  return token;
}

/**
 * Fetch with Microsoft Graph, retrying once on 401 with refreshed token.
 */
async function graphFetch(
  userId: string,
  accessToken: string,
  url: string,
): Promise<any> {
  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="text"',
    },
  });

  if (res.status === 401) {
    // Token expired mid-sync — refresh from user_tokens and retry
    const token = await getUserToken(userId, 'microsoft');
    if (!token?.refresh_token) throw new Error('Token refresh failed on 401 — no refresh token');
    const refreshed = await refreshMicrosoftAccessToken(userId, token.refresh_token);
    if (!refreshed) throw new Error('Token refresh failed on 401');
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${refreshed.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.body-content-type="text"',
      },
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ── Mail Sync ───────────────────────────────────────────────────────────────

async function syncMail(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const select = 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,body';

  // Fetch inbox and sent items in parallel
  const [inboxData, sentData] = await Promise.all([
    graphFetch(userId, accessToken, `${GRAPH_BASE}/me/messages?$filter=${filter}&$select=${select}&$top=200&$orderby=receivedDateTime desc`),
    graphFetch(userId, accessToken, `${GRAPH_BASE}/me/mailFolders/sentitems/messages?$filter=${filter}&$select=${select}&$top=200&$orderby=receivedDateTime desc`),
  ]);

  const inboxMessages = (inboxData.value ?? []).map((m: any) => ({ ...m, _folder: 'inbox' }));
  const sentMessages = (sentData.value ?? []).map((m: any) => ({ ...m, _folder: 'sent' }));
  const allMessages = [...inboxMessages, ...sentMessages];

  if (allMessages.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const msg of allMessages) {
    if (!msg.id) continue;
    try {
      const isSent = msg._folder === 'sent';
      const from = msg.from?.emailAddress?.address ?? '';
      const to = (msg.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(', ');
      const subject = msg.subject ?? '(no subject)';
      const date = msg.receivedDateTime ?? new Date().toISOString();
      const bodyText = msg.body?.content?.slice(0, 3000) ?? msg.bodyPreview ?? '';

      const signalType = isSent ? 'email_sent' : 'email_received';
      const content = isSent
        ? `[Sent email: ${date}]\nTo: ${to}\nSubject: ${subject}\nBody: ${bodyText}`
        : `[Email received: ${date}]\nFrom: ${from}\nSubject: ${subject}\nBody: ${bodyText}`;

      const contentHash = hash(`outlook:${msg.id}`);

      const { error } = await supabase.from('tkg_signals').insert({
        user_id: userId,
        source: 'outlook',
        source_id: msg.id,
        type: signalType,
        content: encrypt(content),
        content_hash: contentHash,
        author: isSent ? 'self' : from,
        occurred_at: new Date(date).toISOString(),
        processed: false,
      });

      if (!error) inserted++;
    } catch {
      // Skip individual message errors
    }
  }

  return inserted;
}

// ── Calendar Sync ───────────────────────────────────────────────────────────

async function syncCalendar(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  const now = new Date().toISOString();
  const url = `${GRAPH_BASE}/me/calendarView?startDateTime=${sinceIso}&endDateTime=${now}&$select=id,subject,start,end,isAllDay,organizer,attendees,bodyPreview&$top=250&$orderby=start/dateTime`;

  const data = await graphFetch(userId, accessToken, url);
  const events = data.value ?? [];
  if (events.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const event of events) {
    if (!event.id) continue;

    const summary = event.subject ?? '(no title)';
    const start = event.start?.dateTime ?? '';
    const end = event.end?.dateTime ?? '';
    const organizer = event.organizer?.emailAddress?.address ?? '';
    const attendees = (event.attendees ?? [])
      .map((a: any) => a.emailAddress?.address)
      .filter(Boolean)
      .join(', ');
    const isAllDay = event.isAllDay ?? false;

    const content = [
      `[Calendar event: ${summary}]`,
      `Start: ${start}`,
      `End: ${end}`,
      isAllDay ? 'All day event' : '',
      organizer ? `Organizer: ${organizer}` : '',
      attendees ? `Attendees: ${attendees}` : '',
      event.bodyPreview ? `Description: ${event.bodyPreview.slice(0, 500)}` : '',
    ].filter(Boolean).join('\n');

    const contentHash = hash(`outlook-calendar:${event.id}`);

    const { error } = await supabase.from('tkg_signals').insert({
      user_id: userId,
      source: 'outlook_calendar',
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

// ── OneDrive Files Sync ─────────────────────────────────────────────────────

async function syncFiles(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  const filter = encodeURIComponent(`lastModifiedDateTime ge ${sinceIso}`);
  const select = 'id,name,lastModifiedDateTime,lastModifiedBy,size,webUrl,file,folder';
  const url = `${GRAPH_BASE}/me/drive/root/search(q='')?$filter=${filter}&$select=${select}&$top=200&$orderby=lastModifiedDateTime desc`;

  let data: any;
  try {
    data = await graphFetch(userId, accessToken, url);
  } catch (err: any) {
    // Files.Read may not be granted yet for existing users — non-fatal
    if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
      console.warn('[microsoft-sync] Files.Read scope not granted, skipping file sync');
      return 0;
    }
    throw err;
  }

  const files = (data.value ?? []).filter((f: any) => f.file); // skip folders
  if (files.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const file of files) {
    if (!file.id) continue;

    const modifiedBy = file.lastModifiedBy?.user?.displayName ?? '';
    const content = [
      `[File modified: ${file.name}]`,
      `Modified: ${file.lastModifiedDateTime}`,
      modifiedBy ? `By: ${modifiedBy}` : '',
      file.size ? `Size: ${Math.round(file.size / 1024)}KB` : '',
      file.webUrl ? `URL: ${file.webUrl}` : '',
    ].filter(Boolean).join('\n');

    const contentHash = hash(`onedrive:${file.id}:${file.lastModifiedDateTime}`);

    const { error } = await supabase.from('tkg_signals').insert({
      user_id: userId,
      source: 'onedrive',
      source_id: file.id,
      type: 'file_modified',
      content: encrypt(content),
      content_hash: contentHash,
      author: modifiedBy || 'self',
      occurred_at: file.lastModifiedDateTime ?? new Date().toISOString(),
      processed: false,
    });

    if (!error) inserted++;
  }

  return inserted;
}

// ── To Do Tasks Sync ────────────────────────────────────────────────────────

async function syncTasks(
  userId: string,
  accessToken: string,
  sinceIso: string,
): Promise<number> {
  // First get task lists
  let listsData: any;
  try {
    listsData = await graphFetch(userId, accessToken, `${GRAPH_BASE}/me/todo/lists`);
  } catch (err: any) {
    if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
      console.warn('[microsoft-sync] Tasks.Read scope not granted, skipping task sync');
      return 0;
    }
    throw err;
  }

  const lists = listsData.value ?? [];
  if (lists.length === 0) return 0;

  const supabase = createServerClient();
  let inserted = 0;

  for (const list of lists) {
    if (!list.id) continue;

    try {
      const filter = encodeURIComponent(`lastModifiedDateTime ge ${sinceIso}`);
      const tasksData = await graphFetch(
        userId,
        accessToken,
        `${GRAPH_BASE}/me/todo/lists/${list.id}/tasks?$filter=${filter}&$select=id,title,status,importance,dueDateTime,lastModifiedDateTime,body&$top=100`,
      );

      const tasks = tasksData.value ?? [];

      for (const task of tasks) {
        if (!task.id) continue;

        const dueDate = task.dueDateTime?.dateTime ?? '';
        const content = [
          `[Task: ${task.title}]`,
          `List: ${list.displayName ?? 'Tasks'}`,
          `Status: ${task.status ?? 'notStarted'}`,
          task.importance ? `Importance: ${task.importance}` : '',
          dueDate ? `Due: ${dueDate}` : '',
          task.body?.content ? `Notes: ${task.body.content.slice(0, 500)}` : '',
        ].filter(Boolean).join('\n');

        const contentHash = hash(`todo:${task.id}:${task.lastModifiedDateTime}`);

        const { error } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'microsoft_todo',
          source_id: task.id,
          type: 'task',
          content: encrypt(content),
          content_hash: contentHash,
          author: 'self',
          occurred_at: task.lastModifiedDateTime ?? new Date().toISOString(),
          processed: false,
        });

        if (!error) inserted++;
      }
    } catch {
      // Skip individual list errors
    }
  }

  return inserted;
}

// ── Main Sync Entry Point ───────────────────────────────────────────────────

export interface MicrosoftSyncResult {
  mail_signals: number;
  calendar_signals: number;
  file_signals: number;
  task_signals: number;
  is_first_sync: boolean;
  error?: string;
}

/**
 * Run Microsoft sync for a user. On first connect (no last_synced_at),
 * pulls 30 days. On subsequent runs, pulls since last sync.
 */
export async function syncMicrosoft(userId: string): Promise<MicrosoftSyncResult> {
  // Get token from user_tokens, refreshing if expired
  const validToken = await getValidMicrosoftToken(userId);
  if (!validToken) {
    return { mail_signals: 0, calendar_signals: 0, file_signals: 0, task_signals: 0, is_first_sync: false, error: 'no_token' };
  }

  // Read last_synced_at separately (getValidMicrosoftToken may have refreshed)
  const tokenMeta = await getUserToken(userId, 'microsoft');
  const isFirstSync = !tokenMeta?.last_synced_at;
  const sinceMs = isFirstSync
    ? Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
    : new Date(tokenMeta!.last_synced_at!).getTime();
  const sinceIso = new Date(sinceMs).toISOString();

  const accessToken = validToken.access_token;

  let mailSignals = 0;
  let calendarSignals = 0;
  let fileSignals = 0;
  let taskSignals = 0;
  const errors: string[] = [];

  try {
    mailSignals = await syncMail(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error('[microsoft-sync] Mail sync failed:', err.message);
    errors.push(`mail: ${err.message}`);
  }

  try {
    calendarSignals = await syncCalendar(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error('[microsoft-sync] Calendar sync failed:', err.message);
    errors.push(`calendar: ${err.message}`);
  }

  try {
    fileSignals = await syncFiles(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error('[microsoft-sync] Files sync failed:', err.message);
    errors.push(`files: ${err.message}`);
  }

  try {
    taskSignals = await syncTasks(userId, accessToken, sinceIso);
  } catch (err: any) {
    console.error('[microsoft-sync] Tasks sync failed:', err.message);
    errors.push(`tasks: ${err.message}`);
  }

  // Update last_synced_at even on partial success
  if (mailSignals > 0 || calendarSignals > 0 || fileSignals > 0 || taskSignals > 0 || errors.length === 0) {
    await updateSyncTimestamp(userId, 'microsoft');
  }

  const total = mailSignals + calendarSignals + fileSignals + taskSignals;
  console.log(
    `[microsoft-sync] user=${userId} first=${isFirstSync} mail=${mailSignals} calendar=${calendarSignals} files=${fileSignals} tasks=${taskSignals} total=${total}` +
    (errors.length > 0 ? ` errors=[${errors.join('; ')}]` : ''),
  );

  return {
    mail_signals: mailSignals,
    calendar_signals: calendarSignals,
    file_signals: fileSignals,
    task_signals: taskSignals,
    is_first_sync: isFirstSync,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}
