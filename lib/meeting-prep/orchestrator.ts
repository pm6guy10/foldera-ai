// =====================================================
// FOLDERA MEETING PREP - Orchestrator
// Coordinates the entire meeting prep workflow
// =====================================================

import { createClient } from '@supabase/supabase-js';
import { syncMeetingsToDatabase, getMeetingsNeedingBriefs } from './google-calendar';
import { syncGmailCache } from './gmail';
import { generateBrief, getBriefByMeetingId } from './brief-generator';
import { sendBrief } from './email';
import { getMeetingPrepUserById } from './auth';
import type { Meeting } from '@/types/meeting-prep';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Process Meeting Briefs Result
 */
export interface ProcessBriefsResult {
  success: boolean;
  users_processed: number;
  meetings_synced: number;
  emails_synced: number;
  briefs_generated: number;
  briefs_sent: number;
  errors: string[];
  duration_ms: number;
}

/**
 * Process Meeting Briefs
 * Main orchestrator function - runs the entire workflow
 * 
 * This is called by cron jobs to automatically generate and send briefs
 * 
 * @param userId - Optional: process for specific user, otherwise process all users
 * @returns Summary of processing results
 */
export async function processMeetingBriefs(userId?: string): Promise<ProcessBriefsResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let usersProcessed = 0;
  let totalMeetingsSynced = 0;
  let totalEmailsSynced = 0;
  let briefsGenerated = 0;
  let briefsSent = 0;
  
  try {
    console.log('[Orchestrator] Starting meeting brief processing...');
    
    // 1. Get list of users to process
    let users: { id: string; email: string; name: string | null }[];
    
    if (userId) {
      const user = await getMeetingPrepUserById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      users = [{ id: user.id, email: user.email, name: user.name }];
    } else {
      // Get all users with Google connections
      const { data, error } = await supabase
        .from('meeting_prep_users')
        .select('id, email, name')
        .not('google_access_token', 'is', null);
      
      if (error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
      }
      
      users = data || [];
    }
    
    console.log(`[Orchestrator] Processing ${users.length} users`);
    
    // 2. Process each user
    for (const user of users) {
      try {
        console.log(`[Orchestrator] Processing user: ${user.email}`);
        
        // Step 1: Sync calendar
        try {
          const calendarResult = await syncMeetingsToDatabase(user.id);
          totalMeetingsSynced += calendarResult.synced + calendarResult.updated;
          console.log(`[Orchestrator] Synced ${calendarResult.synced + calendarResult.updated} meetings for ${user.email}`);
        } catch (error: any) {
          console.error(`[Orchestrator] Calendar sync failed for ${user.email}:`, error);
          errors.push(`Calendar sync (${user.email}): ${error.message}`);
        }
        
        // Step 2: Sync Gmail
        try {
          const emailsResult = await syncGmailCache(user.id);
          totalEmailsSynced += emailsResult;
          console.log(`[Orchestrator] Synced ${emailsResult} emails for ${user.email}`);
        } catch (error: any) {
          console.error(`[Orchestrator] Gmail sync failed for ${user.email}:`, error);
          errors.push(`Gmail sync (${user.email}): ${error.message}`);
        }
        
        // Step 3: Get meetings needing briefs (30-90 min window)
        const meetingsNeedingBriefs = await getMeetingsNeedingBriefs(user.id, {
          min: 30,
          max: 90,
        });
        
        console.log(`[Orchestrator] Found ${meetingsNeedingBriefs.length} meetings needing briefs for ${user.email}`);
        
        // Step 4: Generate and send briefs
        for (const meeting of meetingsNeedingBriefs) {
          try {
            console.log(`[Orchestrator] Processing meeting: ${meeting.title}`);
            
            // Check if brief already exists
            let brief = await getBriefByMeetingId(meeting.id);
            
            if (!brief) {
              // Generate brief
              console.log(`[Orchestrator] Generating brief for meeting: ${meeting.title}`);
              brief = await generateBrief(meeting.id);
              briefsGenerated++;
            } else {
              console.log(`[Orchestrator] Brief already exists for meeting: ${meeting.title}`);
            }
            
            // Send brief if not already sent
            if (!brief.sent_at) {
              console.log(`[Orchestrator] Sending brief for meeting: ${meeting.title}`);
              await sendBrief(user.email, user.name || user.email, meeting, brief);
              briefsSent++;
            } else {
              console.log(`[Orchestrator] Brief already sent for meeting: ${meeting.title}`);
            }
          } catch (error: any) {
            console.error(`[Orchestrator] Error processing meeting ${meeting.id}:`, error);
            errors.push(`Meeting ${meeting.title} (${user.email}): ${error.message}`);
          }
        }
        
        usersProcessed++;
      } catch (error: any) {
        console.error(`[Orchestrator] Error processing user ${user.email}:`, error);
        errors.push(`User ${user.email}: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[Orchestrator] Processing complete in ${duration}ms`);
    console.log(`[Orchestrator] Summary:`, {
      usersProcessed,
      totalMeetingsSynced,
      totalEmailsSynced,
      briefsGenerated,
      briefsSent,
      errors: errors.length,
    });
    
    return {
      success: errors.length === 0,
      users_processed: usersProcessed,
      meetings_synced: totalMeetingsSynced,
      emails_synced: totalEmailsSynced,
      briefs_generated: briefsGenerated,
      briefs_sent: briefsSent,
      errors,
      duration_ms: duration,
    };
  } catch (error: any) {
    console.error('[Orchestrator] Fatal error:', error);
    
    return {
      success: false,
      users_processed: usersProcessed,
      meetings_synced: totalMeetingsSynced,
      emails_synced: totalEmailsSynced,
      briefs_generated: briefsGenerated,
      briefs_sent: briefsSent,
      errors: [...errors, `Fatal error: ${error.message}`],
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Process Single User
 * Convenience function to process a single user
 */
export async function processSingleUser(userId: string): Promise<ProcessBriefsResult> {
  return await processMeetingBriefs(userId);
}

/**
 * Sync All Data for User
 * Syncs calendar + email but doesn't generate briefs
 */
export async function syncUserData(userId: string): Promise<{
  meetings_synced: number;
  emails_synced: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let meetingsSynced = 0;
  let emailsSynced = 0;
  
  try {
    // Sync calendar
    const calendarResult = await syncMeetingsToDatabase(userId);
    meetingsSynced = calendarResult.synced + calendarResult.updated;
    
    if (calendarResult.errors.length > 0) {
      errors.push(...calendarResult.errors);
    }
  } catch (error: any) {
    errors.push(`Calendar sync error: ${error.message}`);
  }
  
  try {
    // Sync Gmail
    emailsSynced = await syncGmailCache(userId);
  } catch (error: any) {
    errors.push(`Gmail sync error: ${error.message}`);
  }
  
  return {
    meetings_synced: meetingsSynced,
    emails_synced: emailsSynced,
    errors,
  };
}

/**
 * Generate Brief for Single Meeting
 * Convenience function to generate and send brief for one meeting
 */
export async function generateAndSendBriefForMeeting(
  meetingId: string
): Promise<{
  success: boolean;
  brief_id?: string;
  message_id?: string;
  error?: string;
}> {
  try {
    // Get meeting
    const { data: meeting } = await supabase
      .from('meetings')
      .select('*, meeting_prep_users:user_id(email, name)')
      .eq('id', meetingId)
      .single();
    
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    
    // Generate brief
    const brief = await generateBrief(meetingId);
    
    // Send email
    const user = (meeting as any).meeting_prep_users;
    const messageId = await sendBrief(
      user.email,
      user.name || user.email,
      meeting as Meeting,
      brief
    );
    
    return {
      success: true,
      brief_id: brief.id,
      message_id: messageId,
    };
  } catch (error: any) {
    console.error('[Orchestrator] Error generating/sending brief:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get Processing Status
 * Returns current status of brief processing for a user
 */
export async function getProcessingStatus(userId: string): Promise<{
  upcoming_meetings: number;
  pending_briefs: number;
  last_calendar_sync?: string;
  last_gmail_sync?: string;
  cached_emails: number;
}> {
  // Get user sync times
  const { data: user } = await supabase
    .from('meeting_prep_users')
    .select('last_calendar_sync, last_gmail_sync')
    .eq('id', userId)
    .single();
  
  // Count upcoming meetings
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const { count: meetingCount } = await supabase
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_cancelled', false)
    .gte('start_time', now.toISOString())
    .lte('start_time', weekFromNow.toISOString());
  
  // Count pending briefs
  const { count: pendingCount } = await supabase
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_cancelled', false)
    .eq('brief_generated', false)
    .gte('start_time', now.toISOString());
  
  // Count cached emails
  const { count: emailCount } = await supabase
    .from('emails_cache')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  
  return {
    upcoming_meetings: meetingCount || 0,
    pending_briefs: pendingCount || 0,
    last_calendar_sync: user?.last_calendar_sync,
    last_gmail_sync: user?.last_gmail_sync,
    cached_emails: emailCount || 0,
  };
}

