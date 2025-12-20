import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { EmailMessage } from './types';
import { extractEmail } from './utils';
import { getGoogleAccessToken } from '@/lib/meeting-prep/auth';
import { getMicrosoftAccessToken } from '@/lib/meeting-prep/auth-microsoft';
import { logger } from '@/lib/observability/logger';
import { withRetry } from '@/lib/utils/retry';

/**
 * Fetches emails from Gmail and converts to EmailMessage format
 */
export async function fetchGmailMessages(
  userId: string,
  userEmail: string,
  lookbackDays: number = 365
): Promise<EmailMessage[]> {
  try {
    const accessToken = await getGoogleAccessToken(userId);
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Calculate date filter
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - lookbackDays);
    const afterTimestamp = Math.floor(afterDate.getTime() / 1000);
    
    logger.info('Fetching Gmail messages', {
      userId,
      lookbackDays,
      afterDate: afterDate.toISOString(),
    });
    
    // Fetch messages with retry logic
    const messages: EmailMessage[] = [];
    let pageToken: string | undefined;
    
    do {
      const response = await withRetry(async () => {
        return await gmail.users.messages.list({
          userId: 'me',
          q: `after:${afterTimestamp}`,
          maxResults: 500,
          pageToken,
        });
      });
      
      const messageList = response.data.messages || [];
      
      // Fetch full message details in batches
      const batchSize = 50;
      for (let i = 0; i < messageList.length; i += batchSize) {
        const batch = messageList.slice(i, i + batchSize);
        
        const batchPromises = batch.map(msg => 
          fetchGmailMessageDetails(gmail, msg.id!, userEmail)
        );
        
        const batchResults = await Promise.all(batchPromises);
        messages.push(...batchResults.filter(m => m !== null) as EmailMessage[]);
      }
      
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    
    logger.info('Fetched Gmail messages', {
      userId,
      messageCount: messages.length,
    });
    
    return messages;
  } catch (error) {
    logger.error('Failed to fetch Gmail messages', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

/**
 * Fetches full message details from Gmail
 */
async function fetchGmailMessageDetails(
  gmail: any,
  messageId: string,
  userEmail: string
): Promise<EmailMessage | null> {
  try {
    const response = await withRetry(async () => {
      return await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });
    });
    
    const msg = response.data;
    const payload = msg.payload;
    
    // Extract headers
    const headers = payload.headers || [];
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    const from = getHeader('from');
    const to = getHeader('to') || '';
    const cc = getHeader('cc') || '';
    const subject = getHeader('subject');
    const dateHeader = getHeader('date');
    const threadId = msg.threadId || messageId;
    
    // Parse date
    let date = new Date();
    if (dateHeader) {
      const parsed = new Date(dateHeader);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
    
    // Extract body
    const body = extractGmailBody(payload);
    const snippet = msg.snippet || body.substring(0, 200);
    
    // Determine if from user
    const fromEmail = extractEmail(from);
    const isFromUser = fromEmail.toLowerCase() === userEmail.toLowerCase();
    
    // Extract labels
    const labels = msg.labelIds || [];
    
    // Parse recipients
    const toList = to.split(',').map(e => e.trim()).filter(Boolean);
    const ccList = cc.split(',').map(e => e.trim()).filter(Boolean);
    
    return {
      id: messageId,
      threadId,
      from,
      to: toList,
      cc: ccList,
      subject,
      body,
      snippet,
      date,
      isFromUser,
      labels,
    };
  } catch (error) {
    logger.error('Failed to fetch Gmail message details', {
      messageId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Extracts plain text body from Gmail message payload
 */
function extractGmailBody(payload: any): string {
  let body = '';
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        body += extractGmailBody(part);
      }
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  
  return body;
}

/**
 * Fetches emails from Outlook and converts to EmailMessage format
 */
export async function fetchOutlookMessages(
  userId: string,
  userEmail: string,
  lookbackDays: number = 365
): Promise<EmailMessage[]> {
  try {
    const accessToken = await getMicrosoftAccessToken(userId);
    
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
    
    // Calculate date filter
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - lookbackDays);
    
    logger.info('Fetching Outlook messages', {
      userId,
      lookbackDays,
      afterDate: afterDate.toISOString(),
    });
    
    const messages: EmailMessage[] = [];
    let skip = 0;
    const pageSize = 50;
    
    while (true) {
      const response = await withRetry(async () => {
        return await client
          .api('/me/messages')
          .filter(`receivedDateTime ge ${afterDate.toISOString()}`)
          .select('id,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime,conversationId')
          .top(pageSize)
          .skip(skip)
          .orderby('receivedDateTime desc')
          .get();
      });
      
      const messageList = response.value || [];
      
      if (messageList.length === 0) {
        break;
      }
      
      for (const msg of messageList) {
        const emailMessage = convertOutlookToEmailMessage(msg, userEmail);
        if (emailMessage) {
          messages.push(emailMessage);
        }
      }
      
      if (messageList.length < pageSize) {
        break;
      }
      
      skip += pageSize;
    }
    
    logger.info('Fetched Outlook messages', {
      userId,
      messageCount: messages.length,
    });
    
    return messages;
  } catch (error) {
    logger.error('Failed to fetch Outlook messages', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

/**
 * Converts Outlook message to EmailMessage format
 */
function convertOutlookToEmailMessage(
  msg: any,
  userEmail: string
): EmailMessage | null {
  try {
    const from = msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '';
    const toRecipients = msg.toRecipients || [];
    const ccRecipients = msg.ccRecipients || [];
    
    const to = toRecipients.map((r: any) => r.emailAddress?.address || r.emailAddress?.name || '').filter(Boolean);
    const cc = ccRecipients.map((r: any) => r.emailAddress?.address || r.emailAddress?.name || '').filter(Boolean);
    
    const subject = msg.subject || '';
    const body = msg.body?.content || msg.bodyPreview || '';
    const snippet = msg.bodyPreview || body.substring(0, 200);
    
    // Parse date
    let date = new Date();
    if (msg.receivedDateTime) {
      const parsed = new Date(msg.receivedDateTime);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
    
    // Determine if from user
    const fromEmail = extractEmail(from);
    const isFromUser = fromEmail.toLowerCase() === userEmail.toLowerCase();
    
    return {
      id: msg.id,
      threadId: msg.conversationId || msg.id,
      from,
      to,
      cc,
      subject,
      body,
      snippet,
      date,
      isFromUser,
      labels: [],  // Outlook doesn't have labels in the same way
    };
  } catch (error) {
    logger.error('Failed to convert Outlook message', {
      messageId: msg.id,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Fetches emails from all connected providers
 */
export async function fetchAllEmails(
  userId: string,
  userEmail: string,
  lookbackDays: number = 365
): Promise<EmailMessage[]> {
  const allMessages: EmailMessage[] = [];
  
  // Try Gmail
  try {
    const gmailMessages = await fetchGmailMessages(userId, userEmail, lookbackDays);
    allMessages.push(...gmailMessages);
  } catch (error) {
    logger.warn('Failed to fetch Gmail messages, continuing', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
  
  // Try Outlook
  try {
    const outlookMessages = await fetchOutlookMessages(userId, userEmail, lookbackDays);
    allMessages.push(...outlookMessages);
  } catch (error) {
    logger.warn('Failed to fetch Outlook messages, continuing', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
  
  // Sort by date
  allMessages.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  logger.info('Fetched all emails', {
    userId,
    totalMessages: allMessages.length,
    gmailCount: allMessages.filter(m => m.labels.length > 0 || m.id.includes('gmail')).length,
    outlookCount: allMessages.filter(m => !m.labels.length && !m.id.includes('gmail')).length,
  });
  
  return allMessages;
}

