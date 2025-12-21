/**
 * Shadow Mode detects these signal types
 */
export type ShadowSignalType = 
  | 'commitment_made'      // User promised something
  | 'commitment_received'  // Someone promised the user
  | 'deadline_approaching' // Known deadline within 48 hours
  | 'ghosting_risk'        // User sent last message, no reply in 3+ days
  | 'vip_escalation'       // Important contact showing urgency
  | 'sentiment_shift'      // Tone changed negative in thread
  | 'calendar_conflict'    // Double-booked or conflict detected
  | 'context_update';      // Background info worth knowing

/**
 * Urgency levels for interruption decisions
 */
export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low' | 'context';

/**
 * A detected signal from Shadow Mode
 */
export interface ShadowSignal {
  id: string;
  type: ShadowSignalType;
  urgency: UrgencyLevel;
  
  // The core insight
  title: string;
  description: string;
  
  // Context
  contactEmail: string;
  contactName: string | null;
  threadSubject: string;
  sourceProvider: 'google' | 'microsoft';
  
  // For commitments
  commitmentText?: string;
  dueDate?: Date;
  
  // AI-generated solution
  recommendedAction: string;
  draftMessage?: string;
  
  // Metadata
  detectedAt: Date;
  sourceMessageId: string;
  confidence: number;
}

/**
 * Result of a Shadow Mode scan
 */
export interface ShadowScanResult {
  userId: string;
  scanId: string;
  
  // Findings
  signals: ShadowSignal[];
  
  // Categorized for quick access
  critical: ShadowSignal[];
  actionRequired: ShadowSignal[];
  context: ShadowSignal[];
  
  // Scan metadata
  emailsScanned: number;
  threadsAnalyzed: number;
  scanDurationMs: number;
  
  // Timing
  scannedAt: Date;
  nextScanAt: Date;
}

/**
 * Configuration for Shadow Mode
 */
export interface ShadowModeConfig {
  // How far back to look
  lookbackHours: number;
  
  // Ghosting threshold
  ghostingDays: number;
  
  // VIP detection
  vipDomains: string[];
  vipEmails: string[];
  
  // Scan frequency
  scanIntervalMinutes: number;
  
  // Cost control
  maxEmailsPerScan: number;
  maxAiCallsPerScan: number;
}

export const DEFAULT_SHADOW_CONFIG: ShadowModeConfig = {
  lookbackHours: 72,
  ghostingDays: 3,
  vipDomains: [],
  vipEmails: [],
  scanIntervalMinutes: 30,
  maxEmailsPerScan: 100,
  maxAiCallsPerScan: 20,
};

