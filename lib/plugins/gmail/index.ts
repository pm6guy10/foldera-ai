// =====================================================
// GMAIL PLUGIN - Main Implementation
// Implements Plugin interface for Gmail integration
// =====================================================

import type { 
  Plugin, 
  PluginError,
  PluginErrorCode,
} from '../plugin-interface';
import type { 
  PluginCredentials, 
  ScanResult, 
  ExecutionResult, 
  DraftAction,
  WorkItem,
} from '@/lib/types/work-item';
import { GmailScanner } from './scanner';
import { GmailParser, ThreadAnalyzer } from './parser';
import { GmailSender } from './sender';

/**
 * Gmail Plugin
 * 
 * First plugin implementation - serves as reference for all future plugins.
 * 
 * CAPABILITIES:
 * - Scans user's Gmail for emails (last 7 days)
 * - Converts emails to universal WorkItem format
 * - Sends drafted emails when user approves
 * - Detects thread patterns and relationships
 * 
 * USAGE:
 * ```typescript
 * const plugin = new GmailPlugin();
 * await plugin.initialize(userId, credentials);
 * const result = await plugin.scan();
 * // Process work items...
 * await plugin.execute(draftAction);
 * ```
 * 
 * TO ADD A NEW PLUGIN:
 * 1. Copy this file structure to /lib/plugins/[plugin-name]/
 * 2. Implement scanner, parser, and sender (if applicable)
 * 3. Update the Plugin interface methods
 * 4. Register in plugin-registry.ts
 */
export class GmailPlugin implements Plugin {
  // Plugin metadata
  name = 'gmail';
  displayName = 'Gmail';
  version = '1.0.0';
  description = 'Scan Gmail emails and send drafted responses';
  icon = '📧';
  
  // Internal state
  private scanner: GmailScanner | null = null;
  private parser: GmailParser | null = null;
  private sender: GmailSender | null = null;
  private threadAnalyzer: ThreadAnalyzer;
  
  private userId: string | null = null;
  private credentials: PluginCredentials | null = null;
  private userEmail: string = 'unknown@example.com';
  
  constructor() {
    this.threadAnalyzer = new ThreadAnalyzer();
  }
  
  /**
   * Initialize Plugin
   * 
   * Sets up Gmail API clients and validates credentials.
   * Must be called before scan() or execute().
   * 
   * @param userId - User ID from database
   * @param credentials - OAuth credentials
   * @throws Error if initialization fails
   */
  async initialize(userId: string, credentials: PluginCredentials): Promise<void> {
    try {
      console.log(`[Gmail Plugin] Initializing for user ${userId}`);
      
      // Validate credentials
      if (!credentials.accessToken) {
        throw new Error('Missing access token');
      }
      
      if (!credentials.refreshToken) {
        throw new Error('Missing refresh token');
      }
      
      // Store credentials
      this.userId = userId;
      this.credentials = credentials;
      
      // Initialize components
      this.scanner = new GmailScanner(userId, credentials);
      this.sender = new GmailSender(userId, credentials);
      
      // Test connection and get user email
      const isConnected = await this.scanner.testConnection();
      
      if (!isConnected) {
        throw new Error('Failed to connect to Gmail API');
      }
      
      // Get user's email address for parser
      // TODO: Fetch from Gmail API profile
      this.userEmail = credentials.userEmail || 'unknown@example.com';
      this.parser = new GmailParser(this.userEmail);
      
      console.log(`[Gmail Plugin] Initialized successfully for ${this.userEmail}`);
      
    } catch (error: any) {
      console.error('[Gmail Plugin] Initialization failed:', error);
      throw new Error(`Gmail plugin initialization failed: ${error.message}`);
    }
  }
  
  /**
   * Scan for New Work Items
   * 
   * Fetches emails from Gmail and converts to WorkItems.
   * 
   * WHAT IT DOES:
   * 1. Fetches emails since 'since' date (or last 7 days)
   * 2. Converts each email to universal WorkItem format
   * 3. Builds relationships between emails in threads
   * 4. Returns ScanResult with work items
   * 
   * WHAT IT DOESN'T DO:
   * - Doesn't detect problems (that's intelligence engine's job)
   * - Doesn't generate drafts (that's draft-generator's job)
   * - Just fetches and formats data
   * 
   * @param since - Fetch emails after this date
   * @param cursor - Pagination cursor (not used yet)
   * @returns ScanResult with WorkItems
   */
  async scan(since?: Date, cursor?: string): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      if (!this.scanner || !this.parser) {
        throw new Error('Plugin not initialized. Call initialize() first.');
      }
      
      console.log(`[Gmail Plugin] Starting scan for user ${this.userId}`);
      
      // Fetch emails from Gmail
      const emails = await this.scanner.fetchEmails(since);
      
      console.log(`[Gmail Plugin] Fetched ${emails.length} emails`);
      
      // Convert to WorkItems
      const workItems: WorkItem[] = this.parser.emailsToWorkItems(emails);
      
      // Build thread relationships
      // Group by thread ID and enhance relationships
      const threadGroups = new Map<string, WorkItem[]>();
      
      for (const item of workItems) {
        const threadId = item.metadata.threadId as string;
        if (!threadGroups.has(threadId)) {
          threadGroups.set(threadId, []);
        }
        threadGroups.get(threadId)!.push(item);
      }
      
      // Enhance relationships within threads
      for (const [threadId, items] of threadGroups) {
        if (items.length > 1) {
          this.threadAnalyzer.buildThreadRelationships(items);
        }
      }
      
      const durationMs = Date.now() - startTime;
      
      console.log(`[Gmail Plugin] Scan complete. ${workItems.length} items in ${durationMs}ms`);
      
      return {
        success: true,
        items: workItems,
        itemCount: workItems.length,
        hasMore: false, // TODO: Implement pagination
        scannedAt: new Date(),
        durationMs,
      };
      
    } catch (error: any) {
      console.error('[Gmail Plugin] Scan failed:', error);
      
      const durationMs = Date.now() - startTime;
      
      return {
        success: false,
        items: [],
        itemCount: 0,
        hasMore: false,
        errors: [error.message],
        scannedAt: new Date(),
        durationMs,
      };
    }
  }
  
  /**
   * Execute Draft Action
   * 
   * Sends an email that was drafted by the intelligence engine
   * and approved by the user.
   * 
   * EXAMPLE:
   * User sees morning brief with draft email to reply to Sarah.
   * User clicks "Approve" in dashboard.
   * This method sends that email via Gmail.
   * 
   * @param action - The approved draft action
   * @returns ExecutionResult
   */
  async execute(action: DraftAction): Promise<ExecutionResult> {
    try {
      if (!this.sender) {
        throw new Error('Plugin not initialized. Call initialize() first.');
      }
      
      // Validate action is for Gmail
      if (action.targetSource !== 'gmail') {
        throw new Error(`Invalid target source: ${action.targetSource}. Expected 'gmail'.`);
      }
      
      // Validate action type
      if (action.type !== 'email') {
        throw new Error(`Invalid action type: ${action.type}. Gmail plugin only supports 'email' actions.`);
      }
      
      console.log(`[Gmail Plugin] Executing email action to: ${action.metadata.to?.join(', ')}`);
      
      // Send email
      const result = await this.sender.sendEmail(action);
      
      if (result.success) {
        console.log(`[Gmail Plugin] Email sent successfully. ID: ${result.itemId}`);
      } else {
        console.error(`[Gmail Plugin] Email send failed: ${result.error}`);
      }
      
      return result;
      
    } catch (error: any) {
      console.error('[Gmail Plugin] Execute failed:', error);
      
      return {
        success: false,
        executedAt: new Date(),
        error: error.message,
      };
    }
  }
  
  /**
   * Health Check
   * 
   * Verifies Gmail plugin is working correctly.
   * 
   * CHECKS:
   * - Credentials exist
   * - Access token not expired
   * - Gmail API is reachable
   * - Send capability available
   * 
   * @returns true if healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.scanner || !this.sender) {
        console.error('[Gmail Plugin] Health check failed: Not initialized');
        return false;
      }
      
      // Check credentials expiry
      if (this.credentials?.expiresAt) {
        const expiresAt = new Date(this.credentials.expiresAt);
        const now = new Date();
        
        if (expiresAt <= now) {
          console.error('[Gmail Plugin] Health check failed: Access token expired');
          return false;
        }
      }
      
      // Test Gmail API connection
      const canConnect = await this.scanner.testConnection();
      
      if (!canConnect) {
        console.error('[Gmail Plugin] Health check failed: Cannot connect to Gmail API');
        return false;
      }
      
      // Test send capability
      const canSend = await this.sender.testSendCapability();
      
      if (!canSend) {
        console.error('[Gmail Plugin] Health check failed: Cannot send emails');
        return false;
      }
      
      console.log('[Gmail Plugin] Health check passed');
      return true;
      
    } catch (error) {
      console.error('[Gmail Plugin] Health check error:', error);
      return false;
    }
  }
  
  /**
   * Refresh Credentials
   * 
   * Use refresh token to get new access token.
   * Called automatically when access token expires.
   * 
   * @returns New credentials
   */
  async refreshCredentials(): Promise<PluginCredentials> {
    if (!this.credentials?.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    try {
      // TODO: Implement token refresh via Google OAuth
      // This would call Google's token endpoint with refresh_token
      
      throw new Error('Token refresh not yet implemented');
      
    } catch (error: any) {
      console.error('[Gmail Plugin] Credential refresh failed:', error);
      throw new Error(`Failed to refresh credentials: ${error.message}`);
    }
  }
  
  /**
   * Get Configuration Schema
   * 
   * Returns settings that can be configured for this plugin
   * 
   * @returns JSON schema
   */
  getSettingsSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        scanDaysBack: {
          type: 'number',
          title: 'Days to Scan',
          description: 'How many days back to scan for emails',
          default: 7,
          minimum: 1,
          maximum: 30,
        },
        maxEmailsPerScan: {
          type: 'number',
          title: 'Max Emails Per Scan',
          description: 'Maximum number of emails to fetch in each scan',
          default: 100,
          minimum: 10,
          maximum: 500,
        },
        includeSpam: {
          type: 'boolean',
          title: 'Include Spam',
          description: 'Include spam folder in scans',
          default: false,
        },
        includeSent: {
          type: 'boolean',
          title: 'Include Sent Emails',
          description: 'Include emails you sent in analysis',
          default: true,
        },
      },
    };
  }
}

/**
 * Plugin Factory
 * 
 * Creates new instance of Gmail plugin.
 * Used by plugin registry.
 */
export function createGmailPlugin(): Plugin {
  return new GmailPlugin();
}

/**
 * Plugin Metadata
 * 
 * Information for plugin registry
 */
export const gmailPluginMetadata = {
  name: 'gmail',
  displayName: 'Gmail',
  description: 'Scan Gmail emails and send drafted responses',
  version: '1.0.0',
  icon: '📧',
  category: 'communication' as const,
  
  oauth: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },
  
  api: {
    baseUrl: 'https://gmail.googleapis.com',
    rateLimit: {
      requests: 25000,
      perSeconds: 86400, // per day
    },
  },
};

