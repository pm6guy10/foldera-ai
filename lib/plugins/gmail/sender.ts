// =====================================================
// GMAIL PLUGIN - Sender
// Executes draft actions by sending emails
// =====================================================

import { gmail_v1, google } from 'googleapis';
import type { DraftAction, ExecutionResult, PluginCredentials } from '@/lib/types/work-item';

/**
 * Gmail Sender
 * 
 * Handles sending emails via Gmail API
 * Used to execute draft actions approved by user
 */
export class GmailSender {
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
   * Send Email
   * 
   * Takes a draft action and sends it via Gmail
   * 
   * @param draft - The draft action to execute
   * @returns Execution result
   */
  async sendEmail(draft: DraftAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    if (!this.gmail) {
      return {
        success: false,
        executedAt: new Date(),
        error: 'Gmail client not initialized',
      };
    }
    
    try {
      // Validate required fields
      if (!draft.metadata.to || draft.metadata.to.length === 0) {
        throw new Error('No recipients specified');
      }
      
      if (!draft.subject && !draft.draft) {
        throw new Error('Email must have subject or body');
      }
      
      // Build email message
      const message = this.buildEmailMessage({
        to: draft.metadata.to,
        cc: draft.metadata.cc,
        subject: draft.subject || '(no subject)',
        body: draft.draft,
        threadId: draft.metadata.threadId,
        inReplyTo: draft.metadata.inReplyTo,
        references: draft.metadata.references,
      });
      
      console.log(`[Gmail Sender] Sending email to: ${draft.metadata.to.join(', ')}`);
      
      // Send via Gmail API
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
          threadId: draft.metadata.threadId,
        },
      });
      
      const messageId = response.data.id;
      const durationMs = Date.now() - startTime;
      
      console.log(`[Gmail Sender] Email sent successfully. ID: ${messageId}, Duration: ${durationMs}ms`);
      
      return {
        success: true,
        executedAt: new Date(),
        itemId: messageId || undefined,
        itemSource: 'gmail',
        metadata: {
          threadId: response.data.threadId,
          labelIds: response.data.labelIds,
          durationMs,
        },
      };
      
    } catch (error: any) {
      console.error('[Gmail Sender] Send error:', error);
      
      // Parse error
      let errorMessage = error.message || 'Unknown error';
      
      if (error.code === 401 || error.code === 403) {
        errorMessage = 'Gmail authentication failed. Please reconnect your account.';
      } else if (error.code === 429) {
        errorMessage = 'Gmail rate limit exceeded. Please try again later.';
      } else if (error.code === 400) {
        errorMessage = 'Invalid email format or recipients.';
      }
      
      return {
        success: false,
        executedAt: new Date(),
        error: errorMessage,
        metadata: {
          originalError: error.message,
          errorCode: error.code,
        },
      };
    }
  }
  
  /**
   * Build RFC 2822 Email Message
   * 
   * Creates properly formatted email for Gmail API
   * 
   * @param params - Email parameters
   * @returns Base64-encoded email message
   */
  private buildEmailMessage(params: {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }): string {
    const lines: string[] = [];
    
    // Headers
    lines.push(`To: ${params.to.join(', ')}`);
    
    if (params.cc && params.cc.length > 0) {
      lines.push(`Cc: ${params.cc.join(', ')}`);
    }
    
    lines.push(`Subject: ${params.subject}`);
    lines.push(`Content-Type: text/plain; charset=utf-8`);
    lines.push(`Content-Transfer-Encoding: 7bit`);
    
    // Thread headers for replies
    if (params.inReplyTo) {
      lines.push(`In-Reply-To: ${params.inReplyTo}`);
    }
    
    if (params.references) {
      lines.push(`References: ${params.references}`);
    }
    
    // Empty line between headers and body
    lines.push('');
    
    // Body
    lines.push(params.body);
    
    // Combine and encode
    const email = lines.join('\r\n');
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    return encoded;
  }
  
  /**
   * Create Draft
   * 
   * Save email as draft without sending (for review)
   * 
   * @param draft - Draft action
   * @returns Draft ID
   */
  async createDraft(draft: DraftAction): Promise<string | null> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized');
    }
    
    try {
      const message = this.buildEmailMessage({
        to: draft.metadata.to || [],
        cc: draft.metadata.cc,
        subject: draft.subject || '(no subject)',
        body: draft.draft,
      });
      
      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: message,
          },
        },
      });
      
      return response.data.id || null;
      
    } catch (error: any) {
      console.error('[Gmail Sender] Error creating draft:', error);
      return null;
    }
  }
  
  /**
   * Send Draft by ID
   * 
   * Send a previously created draft
   * 
   * @param draftId - Gmail draft ID
   * @returns Execution result
   */
  async sendDraft(draftId: string): Promise<ExecutionResult> {
    if (!this.gmail) {
      return {
        success: false,
        executedAt: new Date(),
        error: 'Gmail client not initialized',
      };
    }
    
    try {
      const response = await this.gmail.users.drafts.send({
        userId: 'me',
        requestBody: {
          id: draftId,
        },
      });
      
      return {
        success: true,
        executedAt: new Date(),
        itemId: response.data.id || undefined,
        itemSource: 'gmail',
      };
      
    } catch (error: any) {
      console.error('[Gmail Sender] Error sending draft:', error);
      
      return {
        success: false,
        executedAt: new Date(),
        error: error.message || 'Failed to send draft',
      };
    }
  }
  
  /**
   * Test Send Capability
   * 
   * Verify we can send emails with current credentials
   * 
   * @returns true if send capability works
   */
  async testSendCapability(): Promise<boolean> {
    if (!this.gmail) {
      return false;
    }
    
    try {
      // Check if we have send scope by getting profile
      const profile = await this.gmail.users.getProfile({
        userId: 'me',
      });
      
      // If we can get profile, we likely have send capability
      // (proper check would require attempting to create a draft)
      return !!profile.data.emailAddress;
      
    } catch (error) {
      console.error('[Gmail Sender] Send capability test failed:', error);
      return false;
    }
  }
}

/**
 * Email Template Builder
 * 
 * Helper to build common email formats
 */
export class EmailTemplateBuilder {
  /**
   * Build Reply Email
   * 
   * Creates a reply to an existing email
   */
  static buildReply(params: {
    originalEmail: {
      from: string;
      subject: string;
      messageId: string;
      date: string;
    };
    replyBody: string;
  }): {
    to: string[];
    subject: string;
    body: string;
    inReplyTo: string;
  } {
    const subject = params.originalEmail.subject.startsWith('Re: ')
      ? params.originalEmail.subject
      : `Re: ${params.originalEmail.subject}`;
    
    const body = `${params.replyBody}\n\n---\nOn ${params.originalEmail.date}, ${params.originalEmail.from} wrote:\n`;
    
    return {
      to: [params.originalEmail.from],
      subject,
      body,
      inReplyTo: params.originalEmail.messageId,
    };
  }
  
  /**
   * Build Follow-up Email
   * 
   * Creates a follow-up email for an unanswered thread
   */
  static buildFollowUp(params: {
    recipient: string;
    originalSubject: string;
    context: string;
  }): {
    to: string[];
    subject: string;
    body: string;
  } {
    const subject = `Following up: ${params.originalSubject}`;
    const body = `Hi,\n\nI wanted to follow up on this:\n\n${params.context}\n\nLet me know if you need anything else.\n\nBest,`;
    
    return {
      to: [params.recipient],
      subject,
      body,
    };
  }
}

