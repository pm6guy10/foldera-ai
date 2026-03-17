/**
 * Outlook Calendar — create events on approval + sync past events into tkg_signals.
 * Uses same OAuth tokens as Outlook mail (integrations table, provider 'azure_ad').
 */

import { getMicrosoftTokens } from '@/lib/auth/token-store';

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

