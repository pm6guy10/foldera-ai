// =====================================================
// FOLDERA MEETING PREP - Google Calendar Integration
// Syncs calendar events and manages meeting data
// =====================================================

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from './auth';
import type { Meeting, Attendee, GoogleCalendarEvent, SyncLog } from '@/types/meeting-prep';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get authenticated Google Calendar client
 */
async function getCalendarClient(userId: string) {
  const accessToken = await getGoogleAccessToken(userId);
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Fetch Upcoming Meetings
 * Gets calendar events from Google Calendar API
 * 
 * @param userId - User ID
 * @param daysAhead - How many days ahead to fetch (default: 7)
 * @returns Array of Google Calendar events
 */
export async function fetchUpcomingMeetings(
  userId: string,
  daysAhead: number = 7
): Promise<GoogleCalendarEvent[]> {
  try {
    const calendar = await getCalendarClient(userId);
    
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    
    console.log(`[Calendar] Fetching events from ${now.toISOString()} to ${futureDate.toISOString()}`);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: futureDate.toISOString(),
      singleEvents: true, // Expand recurring events
      orderBy: 'startTime',
      maxResults: 100,
    });
    
    const events = response.data.items || [];
    
    // Filter: only events with attendees (exclude personal tasks/reminders)
    const meetingsWithAttendees = events.filter(event => {
      return (
        event.attendees &&
        event.attendees.length > 0 &&
        event.status !== 'cancelled' &&
        (event.start?.dateTime || event.start?.date) // Has start time
      );
    });
    
    console.log(`[Calendar] Found ${meetingsWithAttendees.length} meetings with attendees (out of ${events.length} total events)`);
    
    return meetingsWithAttendees as GoogleCalendarEvent[];
  } catch (error: any) {
    console.error('[Calendar] Error fetching meetings:', error);
    
    if (error.code === 401 || error.code === 403) {
      throw new Error('Google Calendar authorization failed. Please reconnect your account.');
    }
    
    throw new Error(`Failed to fetch calendar events: ${error.message}`);
  }
}

/**
 * Sync Meetings to Database
 * Fetches meetings from Calendar API and upserts to database
 * 
 * @param userId - User ID
 * @param daysAhead - How many days ahead to sync (default: 7)
 * @returns Summary of sync operation
 */
export async function syncMeetingsToDatabase(
  userId: string,
  daysAhead: number = 7
): Promise<{
  synced: number;
  updated: number;
  failed: number;
  errors: string[];
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  let synced = 0;
  let updated = 0;
  let failed = 0;
  
  try {
    console.log(`[Calendar] Starting sync for user ${userId}`);
    
    // Fetch events from Google Calendar
    const events = await fetchUpcomingMeetings(userId, daysAhead);
    
    // Process each event
    for (const event of events) {
      try {
        const meetingData = transformGoogleEventToMeeting(event, userId);
        
        // Check if meeting already exists
        const { data: existing } = await supabase
          .from('meetings')
          .select('id, updated_at')
          .eq('google_event_id', event.id!)
          .single();
        
        if (existing) {
          // Update existing meeting
          const { error } = await supabase
            .from('meetings')
            .update(meetingData)
            .eq('id', existing.id);
          
          if (error) throw error;
          updated++;
        } else {
          // Insert new meeting
          const { error } = await supabase
            .from('meetings')
            .insert(meetingData);
          
          if (error) throw error;
          synced++;
        }
      } catch (error: any) {
        console.error(`[Calendar] Error processing event ${event.id}:`, error);
        errors.push(`Event ${event.summary}: ${error.message}`);
        failed++;
      }
    }
    
    // Update last sync time
    await supabase
      .from('meeting_prep_users')
      .update({
        last_calendar_sync: new Date().toISOString(),
      })
      .eq('id', userId);
    
    // Log sync operation
    await logSync({
      user_id: userId,
      sync_type: 'calendar',
      status: failed === 0 ? 'success' : 'partial',
      items_synced: synced + updated,
      items_failed: failed,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });
    
    console.log(`[Calendar] Sync complete: ${synced} new, ${updated} updated, ${failed} failed`);
    
    return { synced, updated, failed, errors };
  } catch (error: any) {
    console.error('[Calendar] Sync failed:', error);
    
    // Log failed sync
    await logSync({
      user_id: userId,
      sync_type: 'calendar',
      status: 'error',
      items_synced: synced + updated,
      items_failed: failed,
      error_message: error.message,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });
    
    throw error;
  }
}

/**
 * Get Meetings Needing Briefs
 * Finds meetings that need briefs generated
 * 
 * @param userId - User ID (optional, if not provided fetches for all users)
 * @param minutesAhead - Time window in minutes (default: 30-90 minutes)
 * @returns Array of meetings needing briefs
 */
export async function getMeetingsNeedingBriefs(
  userId?: string,
  minutesAhead: { min: number; max: number } = { min: 30, max: 90 }
): Promise<Meeting[]> {
  const now = new Date();
  const minTime = new Date(now.getTime() + minutesAhead.min * 60000);
  const maxTime = new Date(now.getTime() + minutesAhead.max * 60000);
  
  let query = supabase
    .from('meetings')
    .select('*')
    .eq('brief_generated', false)
    .eq('is_cancelled', false)
    .gte('start_time', minTime.toISOString())
    .lte('start_time', maxTime.toISOString())
    .order('start_time', { ascending: true });
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[Calendar] Error fetching meetings needing briefs:', error);
    throw new Error(`Failed to fetch meetings: ${error.message}`);
  }
  
  console.log(`[Calendar] Found ${data?.length || 0} meetings needing briefs`);
  
  return (data || []) as Meeting[];
}

/**
 * Transform Google Calendar Event to Meeting Object
 * Converts Google's event format to our database schema
 */
function transformGoogleEventToMeeting(
  event: GoogleCalendarEvent,
  userId: string
): Partial<Meeting> {
  // Parse attendees
  const attendees: Attendee[] = (event.attendees || []).map(attendee => ({
    email: attendee.email,
    name: attendee.displayName || undefined,
    responseStatus: attendee.responseStatus as any,
    organizer: attendee.organizer || false,
    self: attendee.self || false,
  }));
  
  // Parse start/end times
  const startTime = event.start?.dateTime || event.start?.date;
  const endTime = event.end?.dateTime || event.end?.date;
  
  if (!startTime || !endTime) {
    throw new Error('Event missing start or end time');
  }
  
  return {
    user_id: userId,
    google_event_id: event.id!,
    title: event.summary || 'Untitled Meeting',
    description: event.description || null,
    location: event.location || null,
    attendees: attendees as any, // JSONB type
    start_time: new Date(startTime).toISOString(),
    end_time: new Date(endTime).toISOString(),
    is_cancelled: event.status === 'cancelled',
    is_recurring: !!event.recurringEventId,
    recurring_event_id: event.recurringEventId || null,
  };
}

/**
 * Get Meeting By ID
 */
export async function getMeetingById(meetingId: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch meeting: ${error.message}`);
  }
  
  return data as Meeting;
}

/**
 * Mark Meeting as Brief Generated
 */
export async function markBriefGenerated(
  meetingId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const updateData: any = {
    brief_generated: success,
    brief_generation_attempted_at: new Date().toISOString(),
  };
  
  if (!success && error) {
    updateData.brief_generation_error = error;
  }
  
  const { error: dbError } = await supabase
    .from('meetings')
    .update(updateData)
    .eq('id', meetingId);
  
  if (dbError) {
    throw new Error(`Failed to update meeting: ${dbError.message}`);
  }
}

/**
 * Mark Brief as Sent
 */
export async function markBriefSent(meetingId: string): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({
      brief_sent: true,
    })
    .eq('id', meetingId);
  
  if (error) {
    throw new Error(`Failed to mark brief as sent: ${error.message}`);
  }
}

/**
 * Log Sync Operation
 * Records sync metadata for debugging and analytics
 */
async function logSync(logData: Partial<SyncLog>): Promise<void> {
  const { error } = await supabase
    .from('sync_logs')
    .insert(logData);
  
  if (error) {
    console.error('[Calendar] Error logging sync:', error);
    // Don't throw - logging failure shouldn't break sync
  }
}

/**
 * Get Recent Sync Logs
 * For debugging and monitoring
 */
export async function getRecentSyncLogs(
  userId?: string,
  limit: number = 10
): Promise<SyncLog[]> {
  let query = supabase
    .from('sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch sync logs: ${error.message}`);
  }
  
  return (data || []) as SyncLog[];
}

