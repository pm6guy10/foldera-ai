// =====================================================
// FOLDERA MEETING PREP - Testing Utilities
// Helper functions for manual testing and debugging
// =====================================================

import { getMeetingPrepUser, getGoogleAccessToken } from './auth';
import { fetchUpcomingMeetings, syncMeetingsToDatabase, getMeetingsNeedingBriefs } from './google-calendar';
import { fetchRecentEmails, getRelevantEmailsForMeeting } from './gmail';
import { generateBrief, getBriefByMeetingId } from './brief-generator';
import { sendBrief } from './email';
import { getMeetingById } from './google-calendar';
import type { Meeting } from '@/types/meeting-prep';

/**
 * Test Google Authentication
 * Verifies that Google OAuth tokens are working
 */
export async function testGoogleAuth(userEmail: string): Promise<{
  success: boolean;
  message: string;
  token?: string;
}> {
  try {
    console.log('[Test] Testing Google authentication for:', userEmail);
    
    const user = await getMeetingPrepUser(userEmail);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found in database',
      };
    }
    
    if (!user.google_access_token || !user.google_refresh_token) {
      return {
        success: false,
        message: 'Google account not connected',
      };
    }
    
    // Try to get valid access token (will refresh if needed)
    const token = await getGoogleAccessToken(user.id);
    
    return {
      success: true,
      message: 'Google authentication working',
      token: token.substring(0, 20) + '...', // Show partial token
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Test Calendar Sync
 * Fetches meetings from Google Calendar and logs them
 */
export async function testCalendarSync(userEmail: string): Promise<{
  success: boolean;
  message: string;
  meetings?: any[];
  synced?: number;
}> {
  try {
    console.log('[Test] Testing calendar sync for:', userEmail);
    
    const user = await getMeetingPrepUser(userEmail);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }
    
    // Fetch meetings from Google
    console.log('[Test] Fetching meetings from Google Calendar...');
    const events = await fetchUpcomingMeetings(user.id, 7);
    
    console.log(`[Test] Found ${events.length} meetings`);
    events.forEach(event => {
      console.log(`  - ${event.summary} (${new Date(event.start.dateTime!).toLocaleString()})`);
    });
    
    // Sync to database
    console.log('[Test] Syncing to database...');
    const result = await syncMeetingsToDatabase(user.id, 7);
    
    return {
      success: true,
      message: `Synced ${result.synced} new, ${result.updated} updated meetings`,
      meetings: events,
      synced: result.synced + result.updated,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Test Gmail Sync
 * Fetches emails from Gmail and logs them
 */
export async function testGmailSync(userEmail: string, daysBack: number = 30): Promise<{
  success: boolean;
  message: string;
  emailsCached?: number;
}> {
  try {
    console.log('[Test] Testing Gmail sync for:', userEmail);
    
    const user = await getMeetingPrepUser(userEmail);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }
    
    console.log(`[Test] Fetching emails from last ${daysBack} days...`);
    const emailsCached = await fetchRecentEmails(user.id, daysBack, 50);
    
    return {
      success: true,
      message: `Cached ${emailsCached} emails`,
      emailsCached,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Test Brief Generation
 * Generates a brief for a specific meeting and logs the result
 */
export async function testBriefGeneration(meetingId: string): Promise<{
  success: boolean;
  message: string;
  brief?: any;
  generationTime?: number;
}> {
  try {
    console.log('[Test] Testing brief generation for meeting:', meetingId);
    
    const meeting = await getMeetingById(meetingId);
    
    if (!meeting) {
      return {
        success: false,
        message: 'Meeting not found',
      };
    }
    
    console.log(`[Test] Meeting: ${meeting.title}`);
    console.log(`[Test] Attendees: ${meeting.attendees.map(a => a.email).join(', ')}`);
    
    // Generate brief
    const startTime = Date.now();
    const brief = await generateBrief(meetingId);
    const generationTime = Date.now() - startTime;
    
    console.log('\n[Test] Brief generated successfully!');
    console.log('==================================');
    console.log('KEY CONTEXT:');
    brief.content.key_context.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
    
    console.log('\nWHAT TO SAY:');
    brief.content.what_to_say.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
    
    console.log('\nWHAT TO AVOID:');
    brief.content.what_to_avoid.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
    
    console.log('\nOPEN THREADS:');
    brief.content.open_threads.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
    
    if (brief.content.relationship_notes) {
      console.log('\nRELATIONSHIP NOTES:');
      console.log(`  ${brief.content.relationship_notes}`);
    }
    
    console.log('==================================\n');
    console.log(`Generation time: ${generationTime}ms`);
    console.log(`Tokens used: ${brief.ai_tokens_used}`);
    
    return {
      success: true,
      message: 'Brief generated successfully',
      brief,
      generationTime,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Test Email Sending
 * Sends a brief via email
 */
export async function testEmailSend(briefId: string): Promise<{
  success: boolean;
  message: string;
  messageId?: string;
}> {
  try {
    console.log('[Test] Testing email send for brief:', briefId);
    
    const brief = await getBriefByMeetingId(briefId);
    
    if (!brief) {
      return {
        success: false,
        message: 'Brief not found',
      };
    }
    
    const meeting = await getMeetingById(brief.meeting_id);
    
    if (!meeting) {
      return {
        success: false,
        message: 'Meeting not found',
      };
    }
    
    const user = await getMeetingPrepUser(meeting.user_id);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }
    
    console.log(`[Test] Sending brief to: ${user.email}`);
    const messageId = await sendBrief(user.email, user.name || user.email, meeting, brief);
    
    return {
      success: true,
      message: `Email sent successfully. Message ID: ${messageId}`,
      messageId,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Get Meetings Needing Briefs (for testing)
 */
export async function listMeetingsNeedingBriefs(userEmail: string): Promise<{
  success: boolean;
  message: string;
  meetings?: Meeting[];
}> {
  try {
    const user = await getMeetingPrepUser(userEmail);
    
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }
    
    const meetings = await getMeetingsNeedingBriefs(user.id, {
      min: 0,
      max: 10080, // 7 days in minutes
    });
    
    console.log(`[Test] Found ${meetings.length} meetings needing briefs:`);
    meetings.forEach(meeting => {
      console.log(`  - ${meeting.title}`);
      console.log(`    ID: ${meeting.id}`);
      console.log(`    Time: ${new Date(meeting.start_time).toLocaleString()}`);
      console.log(`    Attendees: ${meeting.attendees.map(a => a.email).join(', ')}`);
      console.log('');
    });
    
    return {
      success: true,
      message: `Found ${meetings.length} meetings`,
      meetings,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * View Email Context for Meeting
 */
export async function viewEmailContext(meetingId: string): Promise<{
  success: boolean;
  message: string;
  emails?: any[];
}> {
  try {
    const meeting = await getMeetingById(meetingId);
    
    if (!meeting) {
      return {
        success: false,
        message: 'Meeting not found',
      };
    }
    
    const attendeeEmails = meeting.attendees.map(a => a.email);
    const emails = await getRelevantEmailsForMeeting(meeting.user_id, attendeeEmails, 90, 20);
    
    console.log(`[Test] Found ${emails.length} relevant emails:`);
    emails.forEach((email, idx) => {
      console.log(`\n--- EMAIL ${idx + 1} ---`);
      console.log(`From: ${email.from_email}`);
      console.log(`To: ${email.to_emails.join(', ')}`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Date: ${new Date(email.received_at).toLocaleString()}`);
      console.log(`Snippet: ${email.snippet}`);
    });
    
    return {
      success: true,
      message: `Found ${emails.length} emails`,
      emails,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

