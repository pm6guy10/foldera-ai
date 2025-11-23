
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch'; // Required for Graph Client in Node
import { getMicrosoftAccessToken } from '@/lib/meeting-prep/auth-microsoft';

/**
 * Microsoft Outlook Calendar Actuator
 * 
 * Enables the AI to programmatically manipulate the user's Outlook calendar.
 */
export class OutlookActuator {
  private userId: string;
  private client: Client | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initialize the Microsoft Graph Client
   */
  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    const accessToken = await getMicrosoftAccessToken(this.userId);

    this.client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    return this.client;
  }

  /**
   * Move an Event to a new time
   * 
   * @param eventId - ID of the event to move
   * @param newStartTime - ISO string of new start time
   * @param newEndTime - ISO string of new end time
   */
  async moveEvent(
    eventId: string, 
    newStartTime: string, 
    newEndTime: string
  ): Promise<any> {
    const client = await this.getClient();

    console.log(`[OutlookActuator] Moving event ${eventId} to ${newStartTime} - ${newEndTime}`);

    try {
      // 1. Get the original event (optional validation)
      // const event = await client.api(`/me/events/${eventId}`).get();

      // 2. Update with new times
      const updatedEvent = await client.api(`/me/events/${eventId}`).patch({
        start: {
          dateTime: newStartTime,
          timeZone: 'UTC', // Best practice to stick to UTC or infer
        },
        end: {
          dateTime: newEndTime,
          timeZone: 'UTC',
        },
      });

      console.log(`[OutlookActuator] Successfully moved event: ${updatedEvent.subject}`);
      return updatedEvent;

    } catch (error: any) {
      console.error('[OutlookActuator] Error moving event:', error);
      throw new Error(`Failed to move event: ${error.message}`);
    }
  }

  /**
   * Check for conflicts in a time range
   */
  async checkAvailability(
    startTime: string, 
    endTime: string
  ): Promise<any[]> {
    const client = await this.getClient();

    // calendarView is better for checking instances of recurring events
    const response = await client.api('/me/calendarView')
      .query({
        startDateTime: startTime,
        endDateTime: endTime,
        $orderby: 'start/dateTime',
        $select: 'subject,start,end,location'
      })
      .get();

    const conflicts = response.value || [];
    console.log(`[OutlookActuator] Found ${conflicts.length} conflicts between ${startTime} and ${endTime}`);
    
    return conflicts;
  }

  /**
   * Create a Follow-up / Placeholder Event
   */
  async createEvent(
    subject: string, 
    startTime: string, 
    endTime: string, 
    body?: string
  ): Promise<any> {
    const client = await this.getClient();

    const newEvent = {
      subject: subject,
      body: {
        contentType: 'HTML',
        content: body || ''
      },
      start: {
        dateTime: startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endTime,
        timeZone: 'UTC'
      }
    };

    const createdEvent = await client.api('/me/events').post(newEvent);

    console.log(`[OutlookActuator] Created event: ${createdEvent.subject} (${createdEvent.id})`);
    return createdEvent;
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<void> {
    const client = await this.getClient();
    await client.api(`/me/events/${eventId}`).delete();
    console.log(`[OutlookActuator] Deleted event: ${eventId}`);
  }
}

