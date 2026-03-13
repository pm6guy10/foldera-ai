/**
 * Outlook Calendar — create events on approval + sync past events into tkg_signals.
 * Uses same OAuth tokens as Outlook mail (integrations table, provider 'azure_ad').
 */

import { getMicrosoftTokens } from '@/lib/auth/token-store';
import { createServerClient }  from '@/lib/db/client';
import { encrypt }             from '@/lib/encryption';

export interface CalendarEventInput {
  title: string;
  start: string;   // ISO 8601
  end: string;     // ISO 8601
  description?: string;
  location?: string;
}

export interface CreateEventResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Create a calendar event via Microsoft Graph.
 */
export async function createOutlookCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CreateEventResult> {
  const tokens = await getMicrosoftTokens(userId);
  if (!tokens) return { success: false, error: 'No Microsoft tokens for user' };

  const payload = {
    subject: input.title,
    body: {
      contentType: 'text',
      content: input.description ?? '',
    },
    start: {
      dateTime: input.start,
      timeZone: 'UTC',
    },
    end: {
      dateTime: input.end,
      timeZone: 'UTC',
    },
    location: input.location ? { displayName: input.location } : undefined,
  };

  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `Graph ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, eventId: data.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[outlook-calendar] create event failed:', msg);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Calendar sync — fetch past 7 days of events into tkg_signals
// ---------------------------------------------------------------------------

interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end:   { dateTime: string; timeZone: string };
  isAllDay: boolean;
  organizer: { emailAddress: { name: string; address: string } } | null;
  attendees: Array<{
    emailAddress: { name: string; address: string };
    status: { response: string };
  }>;
  responseStatus: { response: string } | null;
}

/**
 * Fetch calendar events from the last 7 days via Microsoft Graph calendarView
 * and write each as a tkg_signal with source='outlook_calendar'.
 * Deduplicates via content_hash — safe to run multiple times.
 * Returns the number of new signals written.
 */
export async function syncOutlookCalendar(userId: string): Promise<number> {
  const tokens = await getMicrosoftTokens(userId);
  if (!tokens) {
    console.log('[outlook-calendar] no tokens for user', userId);
    return 0;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now          = new Date().toISOString();

  // calendarView is the recommended endpoint for date-range queries
  const url =
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${sevenDaysAgo}` +
    `&endDateTime=${now}` +
    `&$select=id,subject,start,end,isAllDay,organizer,attendees,responseStatus` +
    `&$top=50`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization:  `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error('[outlook-calendar] fetch error:', msg);
    return 0;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[outlook-calendar] Graph error:', res.status, body.slice(0, 200));
    return 0;
  }

  const data   = await res.json() as { value: GraphCalendarEvent[] };
  const events = data.value ?? [];
  if (events.length === 0) return 0;

  const supabase = createServerClient();
  let written = 0;

  for (const event of events) {
    const contentHash = `outlook-calendar-${event.id}`;

    const summary = {
      subject:        event.subject,
      start:          event.start,
      end:            event.end,
      isAllDay:       event.isAllDay,
      organizer:      event.organizer?.emailAddress ?? null,
      attendees:      (event.attendees ?? []).map(a => ({
        name:     a.emailAddress?.name,
        address:  a.emailAddress?.address,
        response: a.status?.response,
      })),
      responseStatus: event.responseStatus?.response ?? null,
    };

    const { error } = await supabase.from('tkg_signals').insert({
      user_id:      userId,
      source:       'outlook_calendar',
      source_id:    event.id,
      type:         'calendar_event',
      content:      encrypt(JSON.stringify(summary)),
      content_hash: contentHash,
      author:       'outlook-calendar',
      occurred_at:  event.start.dateTime,
      processed:    true,
    });

    if (!error) {
      written++;
    } else if (error.code !== '23505') {
      // 23505 = unique_violation (duplicate run) — silently skip
      console.warn('[outlook-calendar] insert error for event', event.id, error.message);
    }
  }

  console.log(`[outlook-calendar] ${written}/${events.length} events written for user ${userId}`);
  return written;
}
