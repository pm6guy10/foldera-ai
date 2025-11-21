// =====================================================
// UNIVERSAL GRAPH - Context Engine Types
// Normalizes all work signals from any source
// =====================================================

/**
 * Work Signal Source
 * All possible sources that can generate work signals
 */
export type WorkSignalSource = 
  | 'gmail'
  | 'slack'
  | 'linear'
  | 'notion'
  | 'calendar';

/**
 * Signal Status
 * Current state of the work signal
 */
export type SignalStatus = 
  | 'OPEN'      // Active, needs attention
  | 'CLOSED'    // Resolved, completed
  | 'WAITING';  // Pending, blocked

/**
 * Signal Priority
 * Importance level of the work signal
 */
export type SignalPriority = 
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

/**
 * Context Bucket
 * Groups of related signals organized by context
 */
export interface ContextBucket {
  name: string;                  // Bucket name (e.g., "Project Phoenix Update", "Hiring Issues")
  description: string;           // What this bucket represents
  signalIds: string[];          // IDs of signals in this bucket
  priority: SignalPriority;     // Highest priority in bucket
  lastActivity: Date;           // Most recent signal timestamp
}

/**
 * Briefing Object
 * Output of the graph processor - organized context buckets
 */
export interface BriefingObject {
  buckets: ContextBucket[];     // Organized context buckets
  totalSignals: number;         // Total signals processed
  relationships: Array<{        // Connections discovered
    signalId: string;
    relatedSignalId: string;
    reason: string;
  }>;
  generatedAt: Date;            // When briefing was generated
}

/**
 * Relationship Type
 * How signals relate to each other
 */
export type RelationshipType =
  | 'BLOCKS'           // Signal A blocks Signal B (dependency)
  | 'RELATES_TO'       // Signals are related/connected
  | 'MENTIONS'         // Signal A mentions/references Signal B
  | 'DUPLICATE'        // Signals describe the same thing
  | 'FOLLOW_UP'        // Signal B is a follow-up to Signal A
  | 'SUBTASK'          // Signal B is part of Signal A
  | string;            // Allow custom relationship types

/**
 * Relationship
 * Connection between two work signals
 */
export interface SignalRelationship {
  targetId: string;              // ID of the related signal
  type: RelationshipType;        // How they're related
  confidence?: number;           // AI confidence score (0-1)
  reason?: string;               // Why they're linked (for debugging)
}

/**
 * Work Signal
 * The universal atom - normalized work item from any source
 * 
 * This is the core abstraction that allows the Context Engine
 * to process information from Gmail, Slack, Linear, Notion uniformly.
 */
export interface WorkSignal {
  // Identity & Source
  id: string;                    // Unique ID (source:id format recommended)
  source: WorkSignalSource;      // Where this came from
  
  // Core content
  author: string;                // Who created it (email, name, handle)
  timestamp: Date;               // When this was created/modified
  url: string;                   // Deep link to the original item (required)
  content: string;               // The raw text content
  
  // AI-generated fields
  summary: string;               // AI generated one-liner summary
  context_tags?: string[];       // Tags like ["Project Phoenix", "Urgent", "Budget"]
  relationships?: SignalRelationship[];  // Connections to other signals
  
  // Status & Priority (can be set by AI or source system)
  status: SignalStatus;          // Current state (OPEN, CLOSED, WAITING)
  priority: SignalPriority;      // Importance level (HIGH, MEDIUM, LOW)
}

/**
 * Signal Batch
 * Collection of signals being processed together
 */
export interface SignalBatch {
  signals: WorkSignal[];
  batchId: string;               // Unique batch identifier
  processedAt?: Date;
}

/**
 * Processing Result
 * Result of processing a batch of signals
 */
export interface ProcessingResult {
  success: boolean;
  signalsProcessed: number;
  relationshipsCreated: number;
  tagsGenerated: number;
  errors?: string[];
  processingTimeMs?: number;
}

/**
 * Knowledge Graph Node
 * A processed signal ready for graph traversal
 */
export interface GraphNode extends WorkSignal {
  // Graph-specific fields
  inDegree: number;              // How many signals reference this
  outDegree: number;             // How many signals this references
  centrality?: number;           // Importance score (optional)
}

/**
 * Graph Query
 * Search/filter the knowledge graph
 */
export interface GraphQuery {
  sources?: WorkSignalSource[];
  tags?: string[];
  author?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  relatedTo?: string;            // Find signals related to this ID
  relationshipType?: RelationshipType;
}

