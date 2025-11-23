
import { google, calendar_v3 } from 'googleapis';
import { getGoogleAccessToken } from '@/lib/meeting-prep/auth';

/**
 * Google Calendar Actuator
 * 
 * Enables the AI to programmatically manipulate the user's calendar.
 * This is "Actuator #2" in the Orchestrator vision.
 */
export class CalendarActuator {
  private userId: string;
  private client: calendar_v3.Calendar | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initialize the Google Calendar Client
   */
  private async getClient(): Promise<calendar_v3.Calendar> {
    if (this.client) return this.client;

    const accessToken = await getGoogleAccessToken(this.userId);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    this.client = google.calendar({ version: 'v3', auth: oauth2Client });
    return this.client;
  }

  /**
   * Move an Event to a new time
   * 
   * @param eventId - ID of the event to move
   * @param newStartTime - ISO string of new start time
   * @param newEndTime - ISO string of new end time
   * @returns Updated event object
   */
  async moveEvent(
    eventId: string, 
    newStartTime: string, 
    newEndTime: string
  ): Promise<calendar_v3.Schema$Event> {
    const calendar = await this.getClient();

    console.log(`[CalendarActuator] Moving event ${eventId} to ${newStartTime} - ${newEndTime}`);

    try {
      // 1. Get the original event to preserve details
      const { data: originalEvent } = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId,
      });

      if (!originalEvent) {
        throw new Error(`Event ${eventId} not found.`);
      }

      // 2. Update with new times
      const { data: updatedEvent } = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: {
          start: { dateTime: newStartTime },
          end: { dateTime: newEndTime },
        },
      });

      console.log(`[CalendarActuator] Successfully moved event: ${updatedEvent.summary}`);
      return updatedEvent;

    } catch (error: any) {
      console.error('[CalendarActuator] Error moving event:', error);
      throw new Error(`Failed to move event: ${error.message}`);
    }
  }

  /**
   * Check for conflicts in a time range
   * 
   * @param startTime - ISO string
   * @param endTime - ISO string
   * @returns Array of conflicting events (empty if free)
   */
  async checkAvailability(
    startTime: string, 
    endTime: string
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await this.getClient();

    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const conflicts = data.items || [];
    console.log(`[CalendarActuator] Found ${conflicts.length} conflicts between ${startTime} and ${endTime}`);
    
    return conflicts;
  }

  /**
   * Create a Follow-up / Placeholder Event
   * Useful for blocking time for deep work or travel
   */
  async createEvent(
    title: string, 
    startTime: string, 
    endTime: string, 
    description?: string
  ): Promise<calendar_v3.Schema$Event> {
    const calendar = await this.getClient();

    const { data: newEvent } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description: description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      },
    });

    console.log(`[CalendarActuator] Created event: ${newEvent.summary} (${newEvent.id})`);
    return newEvent;
  }
}

