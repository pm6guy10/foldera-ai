// =====================================================
// GMAIL PLUGIN - Parser
// Converts Gmail emails to universal WorkItem format
// =====================================================

import type { WorkItem, WorkItemRelationship } from '@/lib/types/work-item';
import type { GmailEmail } from './scanner';
import { getHeader, extractBody, parseEmailAddress, parseEmailList } from './scanner';

/**
 * Email to WorkItem Parser
 * 
 * Converts Gmail-specific email format to universal WorkItem format
 * that the intelligence engine can process.
 * 
 * CRITICAL: This is the abstraction layer that allows the core
 * intelligence engine to be source-agnostic.
 */
export class GmailParser {
  private userEmail: string;
  
  constructor(userEmail: string) {
    this.userEmail = userEmail.toLowerCase();
  }
  
  /**
   * Convert Gmail Email to WorkItem
   * 
   * Maps Gmail-specific fields to universal WorkItem structure.
   * Extracts relationships, metadata, and content.
   * 
   * @param email - Gmail email object
   * @returns WorkItem
   */
  emailToWorkItem(email: GmailEmail): WorkItem {
    // Extract headers
    const headers = email.payload?.headers || [];
    const from = getHeader(headers, 'From') || 'unknown';
    const to = getHeader(headers, 'To') || '';
    const cc = getHeader(headers, 'Cc') || '';
    const subject = getHeader(headers, 'Subject') || '(no subject)';
    const date = getHeader(headers, 'Date');
    const messageId = getHeader(headers, 'Message-ID') || email.id;
    const inReplyTo = getHeader(headers, 'In-Reply-To');
    const references = getHeader(headers, 'References');
    
    // Parse email addresses
    const fromParsed = parseEmailAddress(from);
    const toEmails = parseEmailList(to);
    const ccEmails = parseEmailList(cc);
    
    // Extract body
    const body = extractBody(email.payload);
    const content = body.text || body.html || email.snippet || '';
    
    // Parse timestamp
    const timestamp = date 
      ? new Date(date) 
      : email.internalDate 
        ? new Date(parseInt(email.internalDate))
        : new Date();
    
    // Build relationships
    const relationships: WorkItemRelationship[] = [];
    
    // If this is a reply (has In-Reply-To), create relationship
    if (inReplyTo) {
      relationships.push({
        targetId: inReplyTo,
        targetSource: 'gmail',
        relationType: 'replies_to',
        metadata: {
          threadId: email.threadId,
        },
      });
    }
    
    // Parse References header for thread context
    if (references) {
      const refIds = references.split(/\s+/);
      refIds.forEach(refId => {
        if (refId && refId !== messageId && refId !== inReplyTo) {
          relationships.push({
            targetId: refId,
            targetSource: 'gmail',
            relationType: 'references',
            metadata: {
              threadId: email.threadId,
            },
          });
        }
      });
    }
    
    // Determine if this is sent or received
    const isSent = email.labelIds?.includes('SENT') || 
                   fromParsed.email === this.userEmail;
    
    // Build WorkItem
    const workItem: WorkItem = {
      id: email.id!,
      source: 'gmail',
      type: 'email',
      
      timestamp,
      author: fromParsed.email,
      title: subject,
      content: this.cleanContent(content),
      
      metadata: {
        // Gmail-specific
        threadId: email.threadId,
        messageId,
        labels: email.labelIds || [],
        snippet: email.snippet,
        
        // Email-specific
        from: fromParsed.email,
        fromName: fromParsed.name,
        to: toEmails,
        cc: ccEmails,
        
        // Message type
        isSent,
        isReceived: !isSent,
        isUnread: email.labelIds?.includes('UNREAD'),
        isImportant: email.labelIds?.includes('IMPORTANT'),
        isStarred: email.labelIds?.includes('STARRED'),
        
        // Thread context
        isFirstInThread: !inReplyTo,
        
        // Body formats
        hasHtml: !!body.html,
        hasText: !!body.text,
      },
      
      relationships,
      
      createdAt: timestamp,
      fetchedAt: new Date(),
    };
    
    return workItem;
  }
  
  /**
   * Convert Multiple Emails to WorkItems
   * 
   * Batch conversion with relationship building
   * 
   * @param emails - Array of Gmail emails
   * @returns Array of WorkItems
   */
  emailsToWorkItems(emails: GmailEmail[]): WorkItem[] {
    return emails.map(email => this.emailToWorkItem(email));
  }
  
  /**
   * Clean Content
   * 
   * Remove HTML tags, excessive whitespace, signatures, etc.
   * Keep content useful for AI analysis.
   * 
   * @param content - Raw email content
   * @returns Cleaned content
   */
  private cleanContent(content: string): string {
    let cleaned = content;
    
    // Remove HTML tags if present
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
    
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Remove quoted text (lines starting with >)
    cleaned = cleaned.replace(/^>.*$/gm, '');
    
    // Remove excessive newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    
    // Trim
    cleaned = cleaned.trim();
    
    // Limit length for AI processing (keep first 2000 chars)
    if (cleaned.length > 2000) {
      cleaned = cleaned.substring(0, 2000) + '... [truncated]';
    }
    
    return cleaned;
  }
  
  /**
   * Extract Key Information
   * 
   * Pulls out important details for problem detection
   * 
   * @param workItem - WorkItem to analyze
   * @returns Key information object
   */
  extractKeyInfo(workItem: WorkItem): {
    isQuestion: boolean;
    hasDeadline: boolean;
    hasPromise: boolean;
    mentionsPeople: string[];
    urgencyKeywords: string[];
  } {
    const content = workItem.content.toLowerCase();
    
    // Detect questions
    const isQuestion = 
      content.includes('?') ||
      /\b(what|when|where|who|why|how|could|would|can|should)\b/.test(content);
    
    // Detect deadlines
    const hasDeadline = 
      /\b(deadline|due|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+week|end\s+of))/i.test(content) ||
      /\b(asap|urgent|immediately)\b/i.test(content);
    
    // Detect promises/commitments
    const hasPromise = 
      /\b(i'll|i will|i'l|i can|i should|let me|i'm going to|i am going to)\b/i.test(content);
    
    // Extract mentioned people (basic email detection)
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const mentionsPeople = Array.from(content.matchAll(emailRegex))
      .map(match => match[0].toLowerCase())
      .filter(email => email !== workItem.author);
    
    // Detect urgency keywords
    const urgencyWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'rush'];
    const urgencyKeywords = urgencyWords.filter(word => content.includes(word));
    
    return {
      isQuestion,
      hasDeadline,
      hasPromise,
      mentionsPeople,
      urgencyKeywords,
    };
  }
}

/**
 * Thread Analyzer
 * 
 * Analyzes email threads to build relationships and context
 */
export class ThreadAnalyzer {
  /**
   * Build Thread Relationships
   * 
   * Given a set of WorkItems from the same thread,
   * enhance their relationships
   * 
   * @param items - WorkItems in thread
   * @returns Updated WorkItems with enhanced relationships
   */
  buildThreadRelationships(items: WorkItem[]): WorkItem[] {
    // Sort by timestamp
    const sorted = [...items].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Build reply chain
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];
      
      // If not already related, add relationship
      const hasRelationship = current.relationships.some(
        r => r.targetId === previous.id
      );
      
      if (!hasRelationship) {
        current.relationships.push({
          targetId: previous.id,
          targetSource: 'gmail',
          relationType: 'replies_to',
          metadata: {
            threadId: current.metadata.threadId,
            threadPosition: i,
          },
        });
      }
    }
    
    return sorted;
  }
  
  /**
   * Detect Thread Patterns
   * 
   * Finds patterns in thread that indicate problems
   * 
   * @param items - WorkItems in thread
   * @returns Detected patterns
   */
  detectThreadPatterns(items: WorkItem[]): {
    hasUnansweredQuestion: boolean;
    lastQuestionDate?: Date;
    responseTime: number[]; // in hours
    isGhosted: boolean;
    lastMessageFromUser: boolean;
  } {
    const sorted = [...items].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    // Find questions
    const questions = sorted.filter(item => {
      const content = item.content.toLowerCase();
      return content.includes('?') && !item.metadata.isSent;
    });
    
    const hasUnansweredQuestion = questions.length > 0;
    const lastQuestion = questions[questions.length - 1];
    
    // Calculate response times
    const responseTimes: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      // If different authors (actual response)
      if (prev.author !== curr.author) {
        const hoursElapsed = 
          (curr.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60 * 60);
        responseTimes.push(hoursElapsed);
      }
    }
    
    // Check if ghosted (user got reply but didn't respond back)
    const lastTwo = sorted.slice(-2);
    const isGhosted = 
      lastTwo.length === 2 &&
      !lastTwo[0].metadata.isSent &&
      lastTwo[1].metadata.isSent === false;
    
    const lastMessageFromUser = sorted[sorted.length - 1]?.metadata.isSent || false;
    
    return {
      hasUnansweredQuestion,
      lastQuestionDate: lastQuestion?.timestamp,
      responseTime: responseTimes,
      isGhosted,
      lastMessageFromUser,
    };
  }
}

