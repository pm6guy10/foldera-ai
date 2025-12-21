import OpenAI from 'openai';
import { 
  Briefing, 
  BriefingSection, 
  BriefingItem, 
  BriefingStats,
  RelationshipHealthSummary,
  BriefingDeliveryConfig,
  DEFAULT_BRIEFING_CONFIG 
} from './types';
import { ShadowScanResult, ShadowSignal } from '@/lib/shadow-mode/types';
import { RelationshipMap } from '@/lib/relationship-intelligence/types';
import { trackAIUsage } from '@/lib/observability/ai-cost-tracker';
import { logger } from '@/lib/observability/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SUMMARY_PROMPT = `You are a Chief of Staff writing an executive briefing.

Given the following signals and relationship data, write a 2-3 sentence executive summary that:
1. Highlights the most important thing to know
2. Sets the tone for the day (urgent, calm, focused, etc.)
3. Uses "you" and "your" (second person)

Be concise, confident, and actionable. No fluff.

Signals: {{signals}}
Relationship Status: {{relationships}}

Write the summary only, no JSON, no formatting.`;

/**
 * Generates a complete briefing from scan results and relationship data
 */
export async function generateBriefing(
  userId: string,
  scanResult: ShadowScanResult,
  relationshipMap: RelationshipMap | null,
  config: Partial<BriefingDeliveryConfig> = {}
): Promise<Briefing> {
  const briefingConfig = { ...DEFAULT_BRIEFING_CONFIG, ...config };
  const briefingId = `brief_${Date.now()}`;
  
  logger.info('Generating briefing', { userId, briefingId });
  
  // Generate sections
  const criticalAlerts = buildSection(
    '🚨 Critical Alerts',
    scanResult.critical,
    briefingConfig.maxItemsPerSection
  );
  
  const actionRequired = buildSection(
    '⚡ Action Required',
    scanResult.actionRequired.filter(s => s.urgency !== 'critical'),
    briefingConfig.maxItemsPerSection
  );
  
  const relationshipUpdates = buildRelationshipSection(
    '💼 Relationship Updates',
    relationshipMap,
    briefingConfig.maxItemsPerSection
  );
  
  const radarContext = briefingConfig.includeContextSection
    ? buildSection('📡 Radar (Context)', scanResult.context, briefingConfig.maxItemsPerSection)
    : { title: '📡 Radar (Context)', items: [], isEmpty: true };
  
  // Generate AI summary
  const summary = await generateSummary(userId, scanResult, relationshipMap);
  
  // Build stats
  const stats = buildStats(scanResult, relationshipMap);
  
  // Build relationship summaries
  const relationships = relationshipMap
    ? relationshipMap.atRisk.slice(0, 5).map(r => ({
        contactName: r.contact.name || r.contact.email,
        contactEmail: r.contact.email,
        status: r.healthStatus,
        healthScore: r.healthScore,
        recommendation: '', // Would come from predictions
      }))
    : [];
  
  // Determine title
  const title = getDynamicTitle(scanResult.critical.length, stats.actionItems);
  const subtitle = getSubtitle();
  
  return {
    id: briefingId,
    userId,
    title,
    subtitle,
    generatedAt: new Date(),
    summary,
    criticalAlerts,
    actionRequired,
    relationshipUpdates,
    radarContext,
    stats,
    signals: scanResult.signals,
    relationships,
  };
}

/**
 * Builds a section from signals
 */
function buildSection(
  title: string,
  signals: ShadowSignal[],
  maxItems: number
): BriefingSection {
  const items: BriefingItem[] = signals.slice(0, maxItems).map(signal => ({
    id: signal.id,
    icon: getSignalIcon(signal.type),
    title: signal.title,
    description: signal.description,
    hasAction: !!signal.draftMessage,
    actionLabel: signal.draftMessage ? 'Open Draft' : undefined,
    actionUrl: undefined, // Would be magic link
    contactName: signal.contactName || undefined,
    contactEmail: signal.contactEmail,
    urgency: signal.urgency === 'context' ? 'info' : signal.urgency,
  }));
  
  return {
    title,
    items,
    isEmpty: items.length === 0,
  };
}

/**
 * Builds relationship updates section
 */
function buildRelationshipSection(
  title: string,
  relationshipMap: RelationshipMap | null,
  maxItems: number
): BriefingSection {
  if (!relationshipMap) {
    return { title, items: [], isEmpty: true };
  }
  
  const atRiskItems: BriefingItem[] = relationshipMap.atRisk.slice(0, maxItems).map(r => ({
    id: r.id,
    icon: '⚠️',
    title: `${r.contact.name || r.contact.email} needs attention`,
    description: `Health score: ${r.healthScore}/100. ${r.openCommitments.length} open commitments.`,
    hasAction: true,
    actionLabel: 'View Details',
    contactName: r.contact.name || undefined,
    contactEmail: r.contact.email,
    urgency: r.healthScore < 30 ? 'high' : 'medium',
  }));
  
  return {
    title,
    items: atRiskItems,
    isEmpty: atRiskItems.length === 0,
  };
}

/**
 * Gets icon for signal type
 */
function getSignalIcon(type: ShadowSignal['type']): string {
  const icons: Record<string, string> = {
    commitment_made: '📝',
    commitment_received: '📥',
    deadline_approaching: '⏰',
    ghosting_risk: '👻',
    vip_escalation: '🔥',
    sentiment_shift: '😟',
    calendar_conflict: '📅',
    context_update: '💡',
  };
  return icons[type] || '📌';
}

/**
 * Generates AI summary
 */
async function generateSummary(
  userId: string,
  scanResult: ShadowScanResult,
  relationshipMap: RelationshipMap | null
): Promise<string> {
  const signalSummary = scanResult.signals.slice(0, 5).map(s => 
    `${s.urgency}: ${s.title}`
  ).join('; ');
  
  const relationshipSummary = relationshipMap
    ? `${relationshipMap.stats.atRiskRelationships || 0} at-risk, ${relationshipMap.stats.activeRelationships} active`
    : 'No relationship data';
  
  const prompt = SUMMARY_PROMPT
    .replace('{{signals}}', signalSummary || 'No urgent signals')
    .replace('{{relationships}}', relationshipSummary);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
    });
    
    if (response.usage) {
      await trackAIUsage(userId, 'briefing-summary', 'gpt-4o-mini', response.usage);
    }
    
    return response.choices[0]?.message?.content?.trim() || getDefaultSummary(scanResult);
  } catch (error) {
    logger.error('Failed to generate summary', { userId, error });
    return getDefaultSummary(scanResult);
  }
}

/**
 * Default summary when AI fails
 */
function getDefaultSummary(scanResult: ShadowScanResult): string {
  if (scanResult.critical.length > 0) {
    return `You have ${scanResult.critical.length} critical item(s) requiring immediate attention. Review the alerts below before starting your day.`;
  }
  if (scanResult.actionRequired.length > 0) {
    return `${scanResult.actionRequired.length} items need your attention today. Your inbox is under control.`;
  }
  return `All clear. No urgent items detected. Your operations are running smoothly.`;
}

/**
 * Builds stats object
 */
function buildStats(
  scanResult: ShadowScanResult,
  relationshipMap: RelationshipMap | null
): BriefingStats {
  return {
    emailsAnalyzed: scanResult.emailsScanned,
    threadsScanned: scanResult.threadsAnalyzed,
    criticalItems: scanResult.critical.length,
    actionItems: scanResult.actionRequired.length,
    healthyRelationships: relationshipMap?.stats.activeRelationships || 0,
    atRiskRelationships: relationshipMap?.atRisk.length || 0,
  };
}

/**
 * Dynamic title based on state
 */
function getDynamicTitle(criticalCount: number, actionCount: number): string {
  if (criticalCount > 0) {
    return `⚠️ ${criticalCount} Critical Alert${criticalCount > 1 ? 's' : ''}`;
  }
  if (actionCount > 0) {
    return `☕ Morning Briefing: ${actionCount} Action Item${actionCount > 1 ? 's' : ''}`;
  }
  return '☕ Morning Briefing: All Clear';
}

/**
 * Gets day-appropriate subtitle
 */
function getSubtitle(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  return `${days[now.getDay()]}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

