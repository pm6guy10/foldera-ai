// ---------------------------------------------------------------------------
// Chief-of-Staff briefing — Phase 1 pivot output
// Sourced from tkg_signals, tkg_commitments, tkg_entities
// Written to tkg_briefings
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

/**
 * A complete briefing for the user
 */
export interface Briefing {
  id: string;
  userId: string;
  
  // Header
  title: string;
  subtitle: string;
  generatedAt: Date;
  
  // Executive Summary
  summary: string;
  
  // Sections
  criticalAlerts: BriefingSection;
  actionRequired: BriefingSection;
  relationshipUpdates: BriefingSection;
  radarContext: BriefingSection;
  
  // Stats
  stats: BriefingStats;
  
  // Raw data
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
  
  // Action
  hasAction: boolean;
  actionLabel?: string;
  actionUrl?: string;  // Magic link to draft or action
  
  // Context
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

/**
 * Briefing delivery options
 */
export interface BriefingDeliveryConfig {
  // Email
  sendEmail: boolean;
  emailAddress?: string;
  
  // Schedule
  timezone: string;
  preferredTime: string;  // "07:00"
  
  // Frequency
  frequency: 'daily' | 'weekdays' | 'weekly';
  
  // Content
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
