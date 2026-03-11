/**
 * GET /api/cron/sync-calendar
 *
 * Nightly cron (3 AM) — fetches calendar events for the next 7 days and
 * previous 1 day from Google Calendar and/or Outlook Calendar, formats them
 * as text, and pipes through extractFromConversation() to update the graph.
 *
 * Authentication: CRON_SECRET (Bearer token in Authorization header).
 * Detects provider from the integrations table.
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleTokens, getMicrosoftTokens } from '@/lib/auth/token-store';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface SyncResult {
  source: string;
  events: number;
  error?: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  const [googleResult, outlookResult] = await Promise.all([
    syncGoogleCalendar(userId),
    syncOutlookCalendar(userId),
  ]);

  const results = [googleResult, outlookResult];
  const totalEvents = results.reduce((s, r) => s + r.events, 0);

  console.log(
    '[sync-calendar] done —',
    results.map(r => `${r.source}: ${r.events} events${r.error ? ` (err: ${r.error})` : ''}`).join(' | '),
  );

  return NextResponse.json({ ok: true, totalEvents, sources: results });
}

// ── Google Calendar ──────────────────────────────────────────────────────────

async function syncGoogleCalendar(userId: string): Promise<SyncResult> {
  const result: SyncResult = { source: 'google_calendar', events: 0 };

  try {
    const tokens = await getGoogleTokens(userId);
    if (!tokens) return result;

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const eventsRes = await calendar.events.list({
      calendarId: 'primary',
      timeMin: yesterday.toISOString(),
      timeMax: nextWeek.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = eventsRes.data.items ?? [];
    result.events = events.length;

    if (events.length === 0) return result;

    const textBlocks = events.map(ev => {
      const start = ev.start?.dateTime ?? ev.start?.date ?? '';
      const end = ev.end?.dateTime ?? ev.end?.date ?? '';
      const attendees = (ev.attendees ?? [])
        .map(a => `${a.email ?? ''}${a.responseStatus ? ` (${a.responseStatus})` : ''}`)
        .join(', ');
      const duration = computeDuration(start, end);

      return [
        `[Calendar Event: ${start}]`,
        `Title: ${ev.summary ?? '(no title)'}`,
        `Duration: ${duration}`,
        attendees ? `Attendees: ${attendees}` : null,
        ev.description ? `Description: ${ev.description.slice(0, 500)}` : null,
        ev.location ? `Location: ${ev.location}` : null,
      ].filter(Boolean).join('\n');
    });

    const batchText = textBlocks.join('\n\n---\n\n');
    try {
      await extractFromConversation(batchText, userId);
    } catch (err: any) {
      if (!err.message?.includes('already ingested')) {
        console.error('[sync-calendar/google] extraction error:', err.message);
      }
    }
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error('[sync-calendar/google]', err);
  }

  return result;
}

// ── Outlook Calendar ─────────────────────────────────────────────────────────

async function syncOutlookCalendar(userId: string): Promise<SyncResult> {
  const result: SyncResult = { source: 'outlook_calendar', events: 0 };

  try {
    const tokens = await getMicrosoftTokens(userId);
    if (!tokens) return result;

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${yesterday.toISOString()}&endDateTime=${nextWeek.toISOString()}&$top=50&$select=subject,start,end,attendees,bodyPreview,location&$orderby=start/dateTime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (!res.ok) {
      result.error = `Graph API ${res.status}`;
      console.error('[sync-calendar/outlook] fetch failed:', res.status);
      return result;
    }

    const data = await res.json();
    const events: any[] = data.value ?? [];
    result.events = events.length;

    if (events.length === 0) return result;

    const textBlocks = events.map((ev: any) => {
      const start = ev.start?.dateTime ?? '';
      const end = ev.end?.dateTime ?? '';
      const attendees = (ev.attendees ?? [])
        .map((a: any) => {
          const email = a.emailAddress?.address ?? '';
          const status = a.status?.response ?? '';
          return `${email}${status ? ` (${status})` : ''}`;
        })
        .join(', ');
      const duration = computeDuration(start, end);

      return [
        `[Calendar Event: ${start}]`,
        `Title: ${ev.subject ?? '(no title)'}`,
        `Duration: ${duration}`,
        attendees ? `Attendees: ${attendees}` : null,
        ev.bodyPreview ? `Description: ${ev.bodyPreview.slice(0, 500)}` : null,
        ev.location?.displayName ? `Location: ${ev.location.displayName}` : null,
      ].filter(Boolean).join('\n');
    });

    const batchText = textBlocks.join('\n\n---\n\n');
    try {
      await extractFromConversation(batchText, userId);
    } catch (err: any) {
      if (!err.message?.includes('already ingested')) {
        console.error('[sync-calendar/outlook] extraction error:', err.message);
      }
    }
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error('[sync-calendar/outlook]', err);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeDuration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`;
  } catch {
    return 'unknown';
  }
}
