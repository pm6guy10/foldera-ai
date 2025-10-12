// =====================================================
// FOLDERA AI CHIEF OF STAFF - Core Types
// Universal data structures for all plugins
// =====================================================

/**
 * Work Item Source
 * All possible sources that can feed into the intelligence engine
 */
export type WorkItemSource = 
  | 'gmail' 
  | 'drive' 
  | 'slack' 
  | 'calendar' 
  | 'asana'
  | 'linear'
  | 'notion'
  | 'quickbooks'
  | 'salesforce'
  | string; // Allow custom sources

/**
 * Work Item Type
 * Universal types that apply across sources
 */
export type WorkItemType = 
  | 'email'
  | 'document'
  | 'message'
  | 'event'
  | 'task'
  | 'note'
  | 'invoice'
  | 'deal'
  | string; // Allow custom types

/**
 * Relationship Type
 * How work items connect to each other
 */
export type RelationshipType =
  | 'references'      // Item A mentions item B
  | 'replies_to'      // Item A is a response to item B
  | 'blocks'          // Item A prevents progress on item B
  | 'depends_on'      // Item A needs item B to complete
  | 'assigned_to'     // Item A is assigned to person B
  | 'contains'        // Item A contains item B
  | 'related_to'      // Generic relationship
  | string;

/**
 * Work Item Relationship
 * Connects one work item to another
 */
export interface WorkItemRelationship {
  targetId: string;
  targetSource: WorkItemSource;
  relationType: RelationshipType;
  metadata?: Record<string, any>;
}

/**
 * Work Item
 * Universal structure for any piece of work from any source
 * 
 * This is the core abstraction that allows the intelligence engine
 * to process information from Gmail, Drive, Slack, etc. uniformly
 */
export interface WorkItem {
  // Identity
  id: string;                          // Unique ID within source
  source: WorkItemSource;              // Where this came from
  type: WorkItemType;                  // What kind of item
  
  // Core content
  timestamp: Date;                     // When this was created/modified
  author: string;                      // Who created it (email, name, etc.)
  title?: string;                      // Optional title/subject
  content: string;                     // Main content (text, summary, etc.)
  
  // Rich metadata (source-specific data)
  metadata: {
    // Gmail-specific
    to?: string[];
    cc?: string[];
    threadId?: string;
    labels?: string[];
    
    // Drive-specific
    fileType?: string;
    sharedWith?: string[];
    lastModifiedBy?: string;
    
    // Slack-specific
    channel?: string;
    reactions?: Record<string, number>;
    thread?: boolean;
    
    // Calendar-specific
    attendees?: Array<{email: string; status: string}>;
    location?: string;
    duration?: number;
    
    // Task/Project-specific
    status?: string;
    assignee?: string;
    dueDate?: Date;
    priority?: string;
    
    // Allow any other metadata
    [key: string]: any;
  };
  
  // Relationships to other work items
  relationships: WorkItemRelationship[];
  
  // Timestamps for tracking
  createdAt: Date;
  fetchedAt: Date;
}

/**
 * Problem Type
 * Categories of issues the AI can detect
 */
export type ProblemType =
  | 'overdue_promise'       // User promised something, didn't deliver
  | 'missing_deliverable'   // Expected output hasn't appeared
  | 'ghosted_reply'         // User didn't respond to important message
  | 'team_blocker'          // Team member is blocked waiting on user
  | 'doc_error'             // Error found in document
  | 'scheduling_conflict'   // Calendar conflict
  | 'budget_issue'          // Financial problem
  | 'deadline_risk'         // Project at risk of missing deadline
  | 'duplicate_work'        // Multiple people doing same thing
  | 'missing_context'       // Someone needs information
  | string;

/**
 * Problem Priority
 */
export type ProblemPriority = 'high' | 'medium' | 'low';

/**
 * Draft Action Type
 * What kind of action to take
 */
export type DraftActionType =
  | 'email'              // Send an email
  | 'message'            // Send Slack/chat message
  | 'doc_update'         // Update a document
  | 'calendar_update'    // Update calendar event
  | 'task_update'        // Update task status
  | 'comment'            // Add comment to item
  | string;

/**
 * Draft Action
 * A suggested action the AI has prepared
 */
export interface DraftAction {
  type: DraftActionType;
  draft: string;                    // The actual content (email body, message text, etc.)
  subject?: string;                 // For emails, message titles, etc.
  
  // Execution details
  targetSource: WorkItemSource;     // Which plugin should execute this
  targetId?: string;                // ID of item to update (if applicable)
  
  // Additional metadata
  metadata: {
    // Email-specific
    to?: string[];
    cc?: string[];
    
    // Message-specific
    channel?: string;
    threadId?: string;
    
    // Doc-specific
    fileId?: string;
    changes?: any[];
    
    // Task-specific
    status?: string;
    assignee?: string;
    
    [key: string]: any;
  };
}

/**
 * Problem
 * An issue detected by the AI across any sources
 */
export interface Problem {
  // Identity
  id: string;
  userId: string;
  
  // Classification
  type: ProblemType;
  priority: ProblemPriority;
  
  // Description
  title: string;                    // Short title
  description: string;              // Detailed explanation
  reasoning?: string;               // Why AI thinks this is a problem
  
  // Evidence
  affectedItems: WorkItem[];        // Work items that show this problem
  
  // Solution
  suggestedAction: DraftAction;
  
  // Status
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  
  // Timestamps
  detectedAt: Date;
  approvedAt?: Date;
  executedAt?: Date;
}

/**
 * Daily Brief
 * The morning summary sent to user
 */
export interface DailyBrief {
  id: string;
  userId: string;
  
  date: Date;
  
  // Summary stats
  totalProblems: number;
  highPriorityCount: number;
  
  // Problems grouped by priority
  problems: {
    high: Problem[];
    medium: Problem[];
    low: Problem[];
  };
  
  // Metadata
  scannedSources: WorkItemSource[];
  totalItemsScanned: number;
  processingTime: number;
  
  // Delivery
  sentAt?: Date;
  emailMessageId?: string;
}

/**
 * Knowledge Graph Edge
 * Connects work items across sources
 */
export interface KnowledgeGraphEdge {
  id: string;
  userId: string;
  
  // Source item
  item1Id: string;
  item1Source: WorkItemSource;
  
  // Target item
  item2Id: string;
  item2Source: WorkItemSource;
  
  // Relationship
  relationshipType: RelationshipType;
  confidence: number; // 0-1, how confident AI is about this connection
  
  // Metadata
  detectedAt: Date;
  detectedBy: 'user' | 'ai';
  metadata?: Record<string, any>;
}

/**
 * Plugin Credentials
 * Auth data for a specific plugin (encrypted)
 */
export interface PluginCredentials {
  // OAuth tokens
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  
  // API keys
  apiKey?: string;
  
  // Other auth
  [key: string]: any;
}

/**
 * User Plugin Configuration
 * Which plugins are enabled for a user
 */
export interface UserPlugin {
  id: string;
  userId: string;
  
  pluginName: string;
  enabled: boolean;
  
  credentials: PluginCredentials;
  
  lastSync?: Date;
  lastError?: string;
  
  settings: Record<string, any>; // Plugin-specific settings
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Scan Result
 * What a plugin returns after scanning
 */
export interface ScanResult {
  success: boolean;
  items: WorkItem[];
  itemCount: number;
  
  // Pagination
  hasMore: boolean;
  nextCursor?: string;
  
  // Errors
  errors?: string[];
  
  // Metadata
  scannedAt: Date;
  durationMs: number;
}

/**
 * Execution Result
 * Result of executing a draft action
 */
export interface ExecutionResult {
  success: boolean;
  
  // Result details
  executedAt: Date;
  
  // Created/updated item
  itemId?: string;
  itemSource?: WorkItemSource;
  
  // Error info
  error?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

