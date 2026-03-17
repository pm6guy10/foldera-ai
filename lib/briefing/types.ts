// ---------------------------------------------------------------------------
// Conviction engine types — Phase 2
// The engine outputs one thing: the single highest-leverage action today.
// ---------------------------------------------------------------------------

export type ActionType =
  | 'write_document'
  | 'send_message'
  | 'make_decision'
  | 'do_nothing'
  | 'schedule'
  | 'research';

export interface EvidenceItem {
  type: 'signal' | 'commitment' | 'goal' | 'pattern';
  description: string;
  date?: string;
}

/**
 * The single directive the conviction engine produces.
 * Everything else is secondary context.
 */
export interface ConvictionDirective {
  // The lead — the only thing that matters
  directive: string;         // The action in plain English
  action_type: ActionType;
  confidence: number;        // 0-100
  reason: string;            // One sentence, grounded in specific behavioral evidence

  // Secondary context (below the fold)
  evidence: EvidenceItem[];  // The specific signals/patterns that drove this
  fullContext?: string;      // Optional longer prose for the detail panel

  // Search hints — set by the engine when the artifact needs current info
  requires_search?: boolean;
  search_context?: string;   // What to search for (e.g. "WA DOT job posting 2024-12345")
}

// ---------------------------------------------------------------------------
// Artifact types — the finished work product attached to a directive.
// The directive without an artifact is a to-do list.
// The artifact is the product.
// ---------------------------------------------------------------------------

export interface EmailArtifact {
  type: 'email';
  to: string;
  subject: string;
  body: string;
  draft_type: 'email_compose' | 'email_reply';
}

export interface DocumentArtifact {
  type: 'document';
  title: string;
  content: string;
}

export interface CalendarEventArtifact {
  type: 'calendar_event';
  title: string;
  start: string;      // ISO 8601
  end: string;         // ISO 8601
  description: string;
}

export interface ResearchBriefArtifact {
  type: 'research_brief';
  findings: string;
  sources: string[];
  recommended_action: string;
}

export interface DecisionFrameArtifact {
  type: 'decision_frame';
  options: Array<{ option: string; weight: number; rationale: string }>;
  recommendation: string;
}

export interface WaitRationaleArtifact {
  type: 'wait_rationale';
  context: string;
  evidence: string;
  tripwires?: string[];
}

export type ConvictionArtifact =
  | EmailArtifact
  | DocumentArtifact
  | CalendarEventArtifact
  | ResearchBriefArtifact
  | DecisionFrameArtifact
  | WaitRationaleArtifact;

/**
 * Persisted to tkg_actions and returned from /api/conviction/generate
 */
export interface ConvictionAction extends ConvictionDirective {
  id: string;
  userId: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'skipped' | 'draft' | 'draft_rejected' | 'generated' | 'sent';
  generatedAt: string;
  approvedAt?: string;
  executedAt?: string;
  executionResult?: Record<string, unknown>;
  artifact?: ConvictionArtifact | null;
}

// ---------------------------------------------------------------------------
// Draft proposals — Foldera proposes a concrete action; user approves/rejects
// ---------------------------------------------------------------------------

/**
 * The payload stored in tkg_actions.execution_result for draft rows.
 * Flexible JSONB — shape varies by draft_type.
 */
export interface DraftPayload {
  draft_type: 'email_reply' | 'email_compose' | 'schedule_event' | 'generic';
  /** Email-specific fields */
  to?: string;
  subject?: string;
  body?: string;
  /** Source context (e.g. which email triggered this) */
  source?: string;
  source_id?: string;
  [key: string]: unknown;
}

/**
 * A draft action returned from /api/drafts/pending
 */
export interface DraftAction {
  id: string;
  title: string;          // Short human label: "Reply to Alice about proposal"
  description: string;    // One-sentence description of what Foldera will do
  action_type: ActionType;
  draft: DraftPayload;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Chief-of-Staff briefing — Phase 1 output (kept for /api/briefing/latest)
// ---------------------------------------------------------------------------

export interface ChiefOfStaffBriefing {
  userId: string;
  briefingDate: string;         // YYYY-MM-DD
  generatedAt: Date;
  topInsight: string;           // The single most important thing right now
  confidence: number;           // 0-100, traceable to user's own history
  recommendedAction: string;    // One specific action
  fullBrief: string;            // Full 3-5 line brief prose
}

// ---------------------------------------------------------------------------
// Legacy briefing type — kept for backward compatibility
// ---------------------------------------------------------------------------

export interface Briefing {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  generatedAt: Date;
  summary: string;
  criticalAlerts: BriefingSection;
  actionRequired: BriefingSection;
  relationshipUpdates: BriefingSection;
  radarContext: BriefingSection;
  stats: BriefingStats;
  signals: unknown[];
  relationships: RelationshipHealthSummary[];
}

export interface BriefingSection {
  title: string;
  items: BriefingItem[];
  isEmpty: boolean;
}

export interface BriefingItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  hasAction: boolean;
  actionLabel?: string;
  actionUrl?: string;
  contactName?: string;
  contactEmail?: string;
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface BriefingStats {
  emailsAnalyzed: number;
  threadsScanned: number;
  criticalItems: number;
  actionItems: number;
  healthyRelationships: number;
  atRiskRelationships: number;
}

export interface RelationshipHealthSummary {
  contactName: string;
  contactEmail: string;
  status: string;
  healthScore: number;
  recommendation: string;
}

export interface BriefingDeliveryConfig {
  sendEmail: boolean;
  emailAddress?: string;
  timezone: string;
  preferredTime: string;
  frequency: 'daily' | 'weekdays' | 'weekly';
  includeContextSection: boolean;
  maxItemsPerSection: number;
}

export const DEFAULT_BRIEFING_CONFIG: BriefingDeliveryConfig = {
  sendEmail: true,
  timezone: 'America/New_York',
  preferredTime: '07:00',
  frequency: 'weekdays',
  includeContextSection: true,
  maxItemsPerSection: 5,
};
