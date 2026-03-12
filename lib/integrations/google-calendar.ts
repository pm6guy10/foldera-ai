/**
 * Google Calendar — create events on approval.
 * Uses same OAuth tokens as Gmail (integrations table, provider 'google').
 */

import { google } from 'googleapis';
import { getGoogleTokens } from '@/lib/auth/token-store';

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
 * Create a calendar event via Google Calendar API.
 */
export async function createGoogleCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CreateEventResult> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) return { success: false, error: 'No Google tokens for user' };

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

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: input.title,
        description: input.description ?? '',
        location: input.location ?? undefined,
        start: { dateTime: input.start, timeZone: 'UTC' },
        end: { dateTime: input.end, timeZone: 'UTC' },
      },
    });
    return { success: true, eventId: res.data.id ?? undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-calendar] create event failed:', msg);
    return { success: false, error: msg };
  }
}
