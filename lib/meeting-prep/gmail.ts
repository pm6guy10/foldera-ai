// =====================================================
// FOLDERA MEETING PREP - Gmail Integration
// Caches emails for meeting context
// =====================================================

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from './auth';
import type { EmailCache, GmailMessage, SyncLog } from '@/types/meeting-prep';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get authenticated Gmail client
 */
async function getGmailClient(userId: string) {
  const accessToken = await getGoogleAccessToken(userId);
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Fetch Recent Emails
 * Gets emails from Gmail and caches them in database
 * 
 * @param userId - User ID
 * @param daysBack - How many days back to fetch (default: 30)
 * @param maxResults - Max emails to fetch (default: 100)
 * @returns Number of emails cached
 */
export async function fetchRecentEmails(
  userId: string,
  daysBack: number = 30,
  maxResults: number = 100
): Promise<number> {
  const startTime = Date.now();
  let cached = 0;
  let failed = 0;
  const errors: string[] = [];
  
  try {
    console.log(`[Gmail] Fetching emails from last ${daysBack} days for user ${userId}`);
    
    const gmail = await getGmailClient(userId);
    
    // Calculate date query
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterQuery = Math.floor(afterDate.getTime() / 1000); // Unix timestamp
    
    // Search query: emails after date, excluding spam and trash
    const query = `after:${afterQuery} -in:spam -in:trash`;
    
    // List messages
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });
    
    const messages = listResponse.data.messages || [];
    console.log(`[Gmail] Found ${messages.length} messages to process`);
    
    if (messages.length === 0) {
      return 0;
    }
    
    // Fetch full message details (batch requests would be more efficient, but keeping simple for MVP)
    for (const message of messages) {
      try {
        // Check if already cached
        const { data: existing } = await supabase
          .from('emails_cache')
          .select('id')
          .eq('gmail_message_id', message.id!)
          .single();
        
        if (existing) {
          continue; // Already cached, skip
        }
        
        // Fetch full message
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });
        
        const emailData = parseGmailMessage(fullMessage.data as GmailMessage, userId);
        
        // Insert into cache
        const { error } = await supabase
          .from('emails_cache')
          .insert(emailData);
        
        if (error) {
          console.error(`[Gmail] Error caching message ${message.id}:`, error);
          errors.push(error.message);
          failed++;
        } else {
          cached++;
        }
      } catch (error: any) {
        console.error(`[Gmail] Error processing message ${message.id}:`, error);
        errors.push(`Message ${message.id}: ${error.message}`);
        failed++;
      }
    }
    
    // Update last sync time
    await supabase
      .from('meeting_prep_users')
      .update({
        last_gmail_sync: new Date().toISOString(),
      })
      .eq('id', userId);
    
    // Log sync
    await logSync({
      user_id: userId,
      sync_type: 'gmail',
      status: failed === 0 ? 'success' : 'partial',
      items_synced: cached,
      items_failed: failed,
      error_message: errors.length > 0 ? errors.join('; ') : undefined,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });
    
    console.log(`[Gmail] Sync complete: ${cached} cached, ${failed} failed`);
    
    return cached;
  } catch (error: any) {
    console.error('[Gmail] Fetch failed:', error);
    
    // Log failed sync
    await logSync({
      user_id: userId,
      sync_type: 'gmail',
      status: 'error',
      items_synced: cached,
      items_failed: failed,
      error_message: error.message,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });
    
    throw new Error(`Failed to fetch emails: ${error.message}`);
  }
}

/**
 * Get Relevant Emails for Meeting
 * Finds cached emails with meeting attendees
 * 
 * @param userId - User ID
 * @param attendeeEmails - Array of attendee email addresses
 * @param daysBack - How far back to look (default: 90)
 * @param maxEmails - Max emails to return (default: 20)
 * @returns Array of relevant emails
 */
export async function getRelevantEmailsForMeeting(
  userId: string,
  attendeeEmails: string[],
  daysBack: number = 90,
  maxEmails: number = 20
): Promise<EmailCache[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    console.log(`[Gmail] Finding emails with attendees: ${attendeeEmails.join(', ')}`);
    
    // Query: emails where from_email is an attendee OR any to_email is an attendee
    const { data, error } = await supabase
      .from('emails_cache')
      .select('*')
      .eq('user_id', userId)
      .gte('received_at', cutoffDate.toISOString())
      .or(
        attendeeEmails
          .map(email => `from_email.eq.${email},to_emails.cs.{${email}}`)
          .join(',')
      )
      .order('received_at', { ascending: false })
      .limit(maxEmails);
    
    if (error) {
      console.error('[Gmail] Error querying relevant emails:', error);
      throw new Error(`Failed to query emails: ${error.message}`);
    }
    
    console.log(`[Gmail] Found ${data?.length || 0} relevant emails`);
    
    return (data || []) as EmailCache[];
  } catch (error: any) {
    console.error('[Gmail] Error getting relevant emails:', error);
    // Return empty array rather than failing - brief can still be generated without email context
    return [];
  }
}

/**
 * Sync Gmail Cache
 * Smart sync that only fetches new emails since last sync
 * 
 * @param userId - User ID
 * @returns Number of new emails synced
 */
export async function syncGmailCache(userId: string): Promise<number> {
  try {
    // Get last sync time
    const { data: user } = await supabase
      .from('meeting_prep_users')
      .select('last_gmail_sync')
      .eq('id', userId)
      .single();
    
    const lastSync = user?.last_gmail_sync;
    
    if (lastSync) {
      // Calculate days since last sync
      const daysSince = Math.ceil(
        (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`[Gmail] Last sync was ${daysSince} days ago`);
      
      // Fetch emails from last sync date
      return await fetchRecentEmails(userId, daysSince + 1, 100);
    } else {
      // First sync - fetch last 30 days
      console.log(`[Gmail] First sync for user ${userId}`);
      return await fetchRecentEmails(userId, 30, 100);
    }
  } catch (error: any) {
    console.error('[Gmail] Sync failed:', error);
    throw error;
  }
}

/**
 * Parse Gmail Message
 * Converts Gmail API message format to our EmailCache schema
 */
function parseGmailMessage(message: GmailMessage, userId: string): Partial<EmailCache> {
  const headers = message.payload?.headers || [];
  
  // Extract header values
  const getHeader = (name: string): string | undefined => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value;
  };
  
  const from = getHeader('From') || '';
  const to = getHeader('To') || '';
  const cc = getHeader('Cc') || '';
  const subject = getHeader('Subject') || '';
  const date = getHeader('Date') || '';
  
  // Parse email addresses
  const fromEmail = extractEmail(from);
  const fromName = extractName(from);
  const toEmails = parseEmailList(to);
  const ccEmails = parseEmailList(cc);
  
  // Get body content
  const body = extractBody(message.payload!);
  
  // Parse date
  const receivedAt = date ? new Date(date).toISOString() : new Date(parseInt(message.internalDate || '0')).toISOString();
  
  // Check if sent by user (in SENT label)
  const isSent = message.labelIds?.includes('SENT') || false;
  
  return {
    user_id: userId,
    gmail_message_id: message.id!,
    thread_id: message.threadId!,
    from_email: fromEmail,
    from_name: fromName || undefined,
    to_emails: toEmails,
    cc_emails: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    snippet: message.snippet || undefined,
    body_text: body.text || undefined,
    body_html: body.html || undefined,
    received_at: receivedAt,
    labels: message.labelIds || undefined,
    is_sent: isSent,
  };
}

/**
 * Extract email address from "Name <email@example.com>" format
 */
function extractEmail(emailString: string): string {
  const match = emailString.match(/<(.+?)>/);
  if (match) {
    return match[1].trim().toLowerCase();
  }
  return emailString.trim().toLowerCase();
}

/**
 * Extract name from "Name <email@example.com>" format
 */
function extractName(emailString: string): string | null {
  const match = emailString.match(/^(.+?)\s*</);
  if (match) {
    return match[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
  }
  return null;
}

/**
 * Parse comma-separated email list
 */
function parseEmailList(emailString: string): string[] {
  if (!emailString) return [];
  
  return emailString
    .split(',')
    .map(e => extractEmail(e))
    .filter(e => e.length > 0);
}

/**
 * Extract body content from Gmail message payload
 */
function extractBody(payload: any): { text?: string; html?: string } {
  let text: string | undefined;
  let html: string | undefined;
  
  // Check if body is directly in payload
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      html = decoded;
    } else {
      text = decoded;
    }
  }
  
  // Check parts (for multipart messages)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      
      // Recursively check nested parts
      if (part.parts) {
        const nested = extractBody(part);
        text = text || nested.text;
        html = html || nested.html;
      }
    }
  }
  
  return { text, html };
}

/**
 * Log Sync Operation
 */
async function logSync(logData: Partial<SyncLog>): Promise<void> {
  const { error } = await supabase
    .from('sync_logs')
    .insert(logData);
  
  if (error) {
    console.error('[Gmail] Error logging sync:', error);
  }
}

