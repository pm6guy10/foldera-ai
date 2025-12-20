// ============================================
// RELATIONSHIP INTELLIGENCE TYPES
// ============================================

/**
 * Represents a person the user has communicated with
 */
export interface Person {
  email: string;
  name: string | null;
  company: string | null;
  domain: string;
  
  // Enrichment (optional, from external APIs later)
  linkedInUrl?: string;
  avatarUrl?: string;
  title?: string;
}

/**
 * A single data point in the relationship time series
 * Typically represents one week of interaction
 */
export interface TimeSeriesPoint {
  periodStart: Date;
  periodEnd: Date;
  
  // Interaction counts
  messagesSent: number;
  messagesReceived: number;
  totalMessages: number;
  
  // Response behavior
  avgResponseTimeMinutes: number | null;
  
  // Who initiates more
  initiatedByYou: number;
  initiatedByThem: number;
  
  // Sentiment (-1 to 1, extracted by AI)
  sentimentScore: number | null;
}

/**
 * The trajectory of a relationship over time
 */
export interface RelationshipTrajectory {
  // The raw time series data
  timeSeries: TimeSeriesPoint[];
  
  // Computed metrics
  currentVelocity: number;      // messages/week change rate (+ growing, - declining)
  acceleration: number;          // is velocity itself changing?
  
  // Averages for comparison
  avgMessagesPerWeek: number;
  avgResponseTimeMinutes: number | null;
  
  // Patterns
  normalContactFrequencyDays: number;  // How often you typically talk
  daysSinceLastContact: number;
  
  // Who drives the relationship
  initiationRatio: number;  // 0-1, >0.5 means you initiate more
}

/**
 * Health states for a relationship
 */
export type RelationshipHealthStatus = 
  | 'thriving'    // Growing, frequent contact
  | 'strong'      // Stable, healthy frequency
  | 'stable'      // Okay but watch it
  | 'cooling'     // Starting to decline
  | 'decaying'    // Clearly declining
  | 'at_risk'     // Decaying + unfulfilled commitments
  | 'dormant'     // No recent contact
  | 'new';        // Not enough history

/**
 * A commitment/promise extracted from emails
 */
export interface Commitment {
  id: string;
  
  // Direction
  direction: 'outbound' | 'inbound';  // outbound = you promised, inbound = they promised
  
  // Content
  commitmentText: string;
  context: string;  // Surrounding text for context
  
  // Source
  sourceMessageId: string;
  sourceSubject: string;
  sourceDate: Date;
  
  // Timing
  detectedDate: Date;
  dueDate: Date | null;  // Extracted if mentioned, null otherwise
  
  // Status
  status: 'pending' | 'fulfilled' | 'overdue' | 'cancelled';
  fulfilledDate: Date | null;
  
  // Confidence (0-1) in the extraction
  confidence: number;
}

/**
 * A complete relationship record
 */
export interface Relationship {
  id: string;
  userId: string;
  
  // The other person
  contact: Person;
  
  // Trajectory data
  trajectory: RelationshipTrajectory;
  
  // Commitments
  commitments: Commitment[];
  openCommitments: Commitment[];  // Convenience: filtered to pending/overdue
  
  // Health
  healthStatus: RelationshipHealthStatus;
  healthScore: number;  // 0-100 for sorting/comparison
  
  // Predictions
  predictedStatusIn30Days: RelationshipHealthStatus;
  daysUntilDormant: number | null;  // null if not declining
  
  // Metadata
  firstInteraction: Date;
  lastInteraction: Date;
  totalMessages: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The complete relationship map for a user
 */
export interface RelationshipMap {
  userId: string;
  
  // All relationships
  relationships: Relationship[];
  
  // Categorized for quick access
  thriving: Relationship[];
  strong: Relationship[];
  stable: Relationship[];
  atRisk: Relationship[];
  decaying: Relationship[];
  dormant: Relationship[];
  
  // Aggregate stats
  stats: RelationshipStats;
  
  // When this was computed
  computedAt: Date;
}

/**
 * Aggregate statistics about the user's relationships
 */
export interface RelationshipStats {
  totalRelationships: number;
  activeRelationships: number;  // Non-dormant
  
  // Health breakdown
  healthBreakdown: Record<RelationshipHealthStatus, number>;
  
  // Commitments
  totalOpenCommitments: number;
  overdueCommitments: number;
  
  // User behavior
  avgResponseTimeMinutes: number;
  avgMessagesPerWeek: number;
  
  // Trends
  relationshipsGrowing: number;
  relationshipsDecaying: number;
}

/**
 * Prediction result for a relationship
 */
export interface RelationshipPrediction {
  currentStatus: RelationshipHealthStatus;
  predictedStatus: RelationshipHealthStatus;
  daysUntilStatusChange: number | null;
  daysUntilDormant: number | null;
  confidence: number;
  recommendation: string;
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

/**
 * An alert about a relationship that needs attention
 */
export interface RelationshipAlert {
  id: string;
  relationshipId: string;
  contact: Person;
  
  alertType: 'at_risk' | 'decaying' | 'overdue_commitment' | 'going_dormant';
  severity: 'info' | 'warning' | 'urgent';
  
  title: string;
  description: string;
  recommendation: string;
  
  // Suggested action
  suggestedMessageDraft: string | null;
  
  createdAt: Date;
  dismissedAt: Date | null;
}

/**
 * Email message (simplified for processing)
 */
export interface EmailMessage {
  id: string;
  threadId: string;
  
  from: string;
  to: string[];
  cc: string[];
  
  subject: string;
  body: string;
  snippet: string;
  
  date: Date;
  
  // Is this from the user or to the user?
  isFromUser: boolean;
  
  // Labels/folders
  labels: string[];
}

/**
 * Configuration for the extraction process
 */
export interface ExtractionConfig {
  // How far back to analyze
  lookbackDays: number;
  
  // Minimum messages to consider a relationship
  minMessagesThreshold: number;
  
  // Time series bucket size
  bucketSizeDays: number;
  
  // Whether to extract commitments (requires AI)
  extractCommitments: boolean;
  
  // Whether to analyze sentiment (requires AI)
  analyzeSentiment: boolean;
  
  // Domains to exclude (e.g., noreply@, notifications@)
  excludedDomains: string[];
  excludedPatterns: RegExp[];
}

/**
 * Default extraction configuration
 */
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  lookbackDays: 365,
  minMessagesThreshold: 3,
  bucketSizeDays: 7,
  extractCommitments: true,
  analyzeSentiment: false,  // Expensive, enable selectively
  excludedDomains: [
    'noreply',
    'no-reply',
    'notifications',
    'mailer-daemon',
    'postmaster',
    'support',
    'hello',
    'info',
    'newsletter',
    'updates',
    'donotreply',
  ],
  excludedPatterns: [
    /noreply/i,
    /no-reply/i,
    /notifications?@/i,
    /newsletter/i,
    /unsubscribe/i,
    /automated/i,
  ],
};

