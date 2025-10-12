// =====================================================
// FOLDERA MEETING PREP - TypeScript Type Definitions
// Auto-generated from database schema
// =====================================================

/**
 * Meeting Prep User
 * Represents a user of the meeting prep feature
 */
export interface MeetingPrepUser {
  id: string;
  email: string;
  name: string | null;
  
  // Google OAuth (never expose these in API responses)
  google_access_token?: string;
  google_refresh_token?: string;
  google_token_expires_at?: string;
  
  // Settings
  settings: UserSettings;
  
  // Sync metadata
  last_calendar_sync?: string;
  last_gmail_sync?: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * User Settings
 * Preferences for meeting prep notifications and behavior
 */
export interface UserSettings {
  notification_timing_minutes: number; // How many minutes before meeting to send brief
  email_notifications: boolean;
  briefing_detail_level: 'concise' | 'detailed' | 'verbose';
  timezone: string;
  
  // Future settings
  slack_notifications?: boolean;
  mobile_notifications?: boolean;
}

/**
 * Meeting/Calendar Event
 * Represents a calendar meeting from Google Calendar
 */
export interface Meeting {
  id: string;
  user_id: string;
  
  // Google Calendar data
  google_event_id: string;
  calendar_id?: string;
  
  // Meeting details
  title: string;
  description?: string;
  location?: string;
  attendees: Attendee[];
  
  // Timing
  start_time: string; // ISO 8601 timestamp
  end_time: string;
  
  // Brief status
  brief_generated: boolean;
  brief_sent: boolean;
  brief_generation_attempted_at?: string;
  brief_generation_error?: string;
  
  // Metadata
  is_cancelled: boolean;
  is_recurring: boolean;
  recurring_event_id?: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Meeting Attendee
 * Represents a person attending a meeting
 */
export interface Attendee {
  email: string;
  name?: string;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
  self?: boolean;
}

/**
 * Brief
 * AI-generated meeting brief
 */
export interface Brief {
  id: string;
  meeting_id: string;
  user_id: string;
  
  // Brief content
  content: BriefContent;
  
  // Context used
  raw_context?: BriefContext;
  
  // AI metadata
  ai_model: string;
  ai_tokens_used?: number;
  generation_time_ms?: number;
  
  // Delivery
  generated_at: string;
  sent_at?: string;
  opened_at?: string;
  email_message_id?: string;
  
  // Quality tracking
  user_rating?: number; // 1-5
  user_feedback?: string;
  
  // Timestamps
  created_at: string;
}

/**
 * Brief Content
 * Structured AI-generated brief content
 */
export interface BriefContent {
  key_context: string[]; // Important context points
  what_to_say: string[]; // Suggested talking points
  what_to_avoid: string[]; // Topics to avoid
  open_threads: string[]; // Pending items/promises
  relationship_notes?: string; // Overall relationship context
  confidence_score?: number; // How confident the AI is (0-1)
}

/**
 * Brief Context
 * Raw data used to generate the brief
 */
export interface BriefContext {
  emails: EmailSummary[];
  meeting_data: Partial<Meeting>;
  attendee_history?: Record<string, {
    email_count: number;
    last_interaction: string;
  }>;
}

/**
 * Email Summary
 * Simplified email data for brief context
 */
export interface EmailSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  date: string;
  relevant_excerpt?: string; // Key parts extracted by AI
}

/**
 * Email Cache
 * Full cached email from Gmail
 */
export interface EmailCache {
  id: string;
  user_id: string;
  
  // Gmail IDs
  gmail_message_id: string;
  thread_id: string;
  
  // Metadata
  from_email: string;
  from_name?: string;
  to_emails: string[];
  cc_emails?: string[];
  subject?: string;
  
  // Content
  snippet?: string;
  body_text?: string;
  body_html?: string;
  
  // Timing
  received_at: string;
  
  // Metadata
  labels?: string[];
  is_sent: boolean;
  
  // Timestamps
  created_at: string;
}

/**
 * Sync Log
 * Record of sync operations
 */
export interface SyncLog {
  id: string;
  user_id?: string;
  
  sync_type: 'calendar' | 'gmail' | 'brief_generation';
  status: 'success' | 'partial' | 'error';
  
  items_synced: number;
  items_failed: number;
  error_message?: string;
  details?: Record<string, any>;
  
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

/**
 * Sync Request
 * Request to trigger a sync operation
 */
export interface SyncRequest {
  force?: boolean; // Force sync even if recently synced
}

/**
 * Sync Response
 * Result of a sync operation
 */
export interface SyncResponse {
  success: boolean;
  meetings_synced?: number;
  emails_synced?: number;
  briefs_generated?: number;
  errors?: string[];
  sync_log_id?: string;
}

/**
 * Generate Brief Request
 * Request to generate a brief for a meeting
 */
export interface GenerateBriefRequest {
  meeting_id: string;
  force?: boolean; // Regenerate even if already exists
}

/**
 * Generate Brief Response
 * Result of brief generation
 */
export interface GenerateBriefResponse {
  success: boolean;
  brief_id?: string;
  brief?: Brief;
  error?: string;
}

/**
 * Settings Update Request
 */
export interface UpdateSettingsRequest {
  settings: Partial<UserSettings>;
}

// =====================================================
// GOOGLE API TYPES
// =====================================================

/**
 * Google Calendar Event (simplified)
 * Subset of Google Calendar API event object
 */
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    organizer?: boolean;
    self?: boolean;
  }>;
  status?: string; // confirmed, tentative, cancelled
  recurringEventId?: string;
}

/**
 * Gmail Message (simplified)
 * Subset of Gmail API message object
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      data?: string;
    };
    parts?: any[];
  };
}

// =====================================================
// HELPER TYPES
// =====================================================

/**
 * Pagination params
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
}

/**
 * Success response
 */
export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

// =====================================================
// TYPE GUARDS
// =====================================================

export function isMeeting(obj: any): obj is Meeting {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.google_event_id === 'string' &&
    typeof obj.title === 'string' &&
    Array.isArray(obj.attendees)
  );
}

export function isBrief(obj: any): obj is Brief {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.meeting_id === 'string' &&
    typeof obj.content === 'object'
  );
}

// =====================================================
// CONSTANTS
// =====================================================

export const SYNC_INTERVALS = {
  CALENDAR_MINUTES: 15, // Sync calendar every 15 minutes
  GMAIL_MINUTES: 30, // Sync Gmail every 30 minutes
  BRIEF_CHECK_MINUTES: 5, // Check for briefs needed every 5 minutes
} as const;

export const BRIEF_TIMING = {
  DEFAULT_MINUTES_BEFORE: 30, // Send brief 30 min before meeting
  MIN_MINUTES_BEFORE: 15, // Earliest to send
  MAX_MINUTES_BEFORE: 120, // Latest to send
} as const;

export const EMAIL_CONTEXT = {
  DAYS_BACK: 90, // Look back 90 days for relevant emails
  MAX_EMAILS_PER_ATTENDEE: 10, // Max emails to include per attendee
  MAX_TOTAL_EMAILS: 20, // Max total emails in context
} as const;

export const AI_LIMITS = {
  MAX_TOKENS: 4096, // Max tokens for Claude API
  TIMEOUT_MS: 30000, // 30 second timeout
  MAX_RETRIES: 3, // Retry failed generations up to 3 times
} as const;

