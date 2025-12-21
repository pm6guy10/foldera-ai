import { ShadowSignal } from '@/lib/shadow-mode/types';
import { Relationship } from '@/lib/relationship-intelligence/types';

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
  signals: ShadowSignal[];
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

