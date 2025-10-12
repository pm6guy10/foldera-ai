// =====================================================
// GMAIL PLUGIN - Scanner
// Fetches emails from Gmail API
// =====================================================

import { gmail_v1, google } from 'googleapis';
import type { PluginCredentials } from '@/lib/types/work-item';

/**
 * Raw Email Object
 * Gmail API message format (simplified)
 */
export interface GmailEmail {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: gmail_v1.Schema$MessagePart;
  raw?: string;
}

/**
 * Gmail Scanner
 * Handles all Gmail API interactions for fetching emails
 */
export class GmailScanner {
  private gmail: gmail_v1.Gmail | null = null;
  private userId: string;
  
  constructor(userId: string, credentials: PluginCredentials) {
    this.userId = userId;
    this.initializeClient(credentials);
  }
  
  /**
   * Initialize Gmail API Client
   */
  private initializeClient(credentials: PluginCredentials): void {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : undefined,
    });
    
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }
  
  /**
   * Fetch Emails Since Date
   * 
   * Gets all emails modified after the specified date.
   * Includes sent and received emails.
   * 
   * @param since - Fetch emails after this date
   * @param maxResults - Maximum number of emails to fetch (default: 100)
   * @returns Array of Gmail email objects
   */
  async fetchEmails(since?: Date, maxResults: number = 100): Promise<GmailEmail[]> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized');
    }
    
    const emails: GmailEmail[] = [];
    let pageToken: string | undefined;
    
    try {
      // Build query
      // Format: "after:YYYY/MM/DD" for date filtering
      let query = '';
      
      if (since) {
        const dateStr = since.toISOString().split('T')[0].replace(/-/g, '/');
        query = `after:${dateStr}`;
      } else {
        // Default: last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dateStr = sevenDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
        query = `after:${dateStr}`;
      }
      
      // Exclude spam and trash
      query += ' -in:spam -in:trash';
      
      console.log(`[Gmail Scanner] Fetching emails with query: ${query}`);
      
      // Fetch message list (IDs only)
      do {
        const listResponse = await this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: Math.min(maxResults - emails.length, 100),
          pageToken,
        });
        
        const messages = listResponse.data.messages || [];
        
        if (messages.length === 0) {
          break;
        }
        
        console.log(`[Gmail Scanner] Found ${messages.length} messages in batch`);
        
        // Fetch full message details for each ID
        // TODO: Consider using batch requests for better performance
        for (const message of messages) {
          if (!message.id) continue;
          
          try {
            const fullMessage = await this.gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full',
            });
            
            if (fullMessage.data) {
              emails.push(fullMessage.data as GmailEmail);
            }
          } catch (error) {
            console.error(`[Gmail Scanner] Error fetching message ${message.id}:`, error);
            // Continue with other messages
          }
        }
        
        pageToken = listResponse.data.nextPageToken || undefined;
        
        // Stop if we've reached maxResults
        if (emails.length >= maxResults) {
          break;
        }
        
      } while (pageToken);
      
      console.log(`[Gmail Scanner] Fetched ${emails.length} total emails`);
      
      return emails;
      
    } catch (error: any) {
      console.error('[Gmail Scanner] Fetch error:', error);
      
      // Handle specific errors
      if (error.code === 401 || error.code === 403) {
        throw new Error('Gmail authentication failed. Please reconnect your account.');
      }
      
      if (error.code === 429) {
        throw new Error('Gmail rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }
  
  /**
   * Fetch Single Email by ID
   * 
   * @param emailId - Gmail message ID
   * @returns Email object
   */
  async fetchEmailById(emailId: string): Promise<GmailEmail | null> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized');
    }
    
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full',
      });
      
      return response.data as GmailEmail;
    } catch (error: any) {
      console.error(`[Gmail Scanner] Error fetching email ${emailId}:`, error);
      return null;
    }
  }
  
  /**
   * Fetch Emails in Thread
   * 
   * Get all emails in a thread for relationship building
   * 
   * @param threadId - Gmail thread ID
   * @returns Array of emails in thread
   */
  async fetchThread(threadId: string): Promise<GmailEmail[]> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized');
    }
    
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });
      
      const messages = response.data.messages || [];
      return messages as GmailEmail[];
    } catch (error: any) {
      console.error(`[Gmail Scanner] Error fetching thread ${threadId}:`, error);
      return [];
    }
  }
  
  /**
   * Test Connection
   * 
   * Verify Gmail API is accessible with current credentials
   * 
   * @returns true if connection works
   */
  async testConnection(): Promise<boolean> {
    if (!this.gmail) {
      return false;
    }
    
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me',
      });
      
      console.log(`[Gmail Scanner] Connected as: ${response.data.emailAddress}`);
      return true;
    } catch (error) {
      console.error('[Gmail Scanner] Connection test failed:', error);
      return false;
    }
  }
}

/**
 * Helper: Extract Header Value
 * 
 * Gets header value from Gmail message payload
 */
export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || undefined;
}

/**
 * Helper: Extract Email Body
 * 
 * Recursively extracts text/plain or text/html body from Gmail message
 */
export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): {
  text?: string;
  html?: string;
} {
  if (!payload) return {};
  
  let text: string | undefined;
  let html: string | undefined;
  
  // Check direct body
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    
    if (payload.mimeType === 'text/plain') {
      text = decoded;
    } else if (payload.mimeType === 'text/html') {
      html = decoded;
    }
  }
  
  // Check parts (multipart messages)
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
 * Helper: Parse Email Address
 * 
 * Extracts email from "Name <email@example.com>" format
 */
export function parseEmailAddress(emailString: string): {
  email: string;
  name?: string;
} {
  const match = emailString.match(/(.*?)\s*<(.+?)>/);
  
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].trim().toLowerCase(),
    };
  }
  
  return {
    email: emailString.trim().toLowerCase(),
  };
}

/**
 * Helper: Parse Email List
 * 
 * Parses comma-separated list of email addresses
 */
export function parseEmailList(emailList: string): string[] {
  if (!emailList) return [];
  
  return emailList
    .split(',')
    .map(e => parseEmailAddress(e).email)
    .filter(e => e.length > 0);
}

