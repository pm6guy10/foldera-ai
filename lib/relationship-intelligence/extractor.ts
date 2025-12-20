import {
  Relationship,
  RelationshipMap,
  RelationshipStats,
  EmailMessage,
  ExtractionConfig,
  DEFAULT_EXTRACTION_CONFIG,
  Person,
  RelationshipHealthStatus,
} from './types';
import { 
  groupEmailsByPerson, 
  createPerson, 
  generateId,
  daysBetween 
} from './utils';
import { buildTimeSeries, fillTimeSeriesGaps } from './time-series';
import { 
  computeTrajectory, 
  determineHealthStatus, 
  calculateHealthScore,
  predictRelationshipState 
} from './trajectory';
import { extractCommitmentsFromEmails } from './commitment-extractor';
import { logger } from '@/lib/observability/logger';

/**
 * Main extractor class for relationship intelligence
 */
export class RelationshipExtractor {
  private config: ExtractionConfig;
  
  constructor(config: Partial<ExtractionConfig> = {}) {
    this.config = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
  }
  
  /**
   * Extracts relationship map from a list of emails
   */
  async extractRelationships(
    emails: EmailMessage[],
    userId: string,
    userEmail: string
  ): Promise<RelationshipMap> {
    logger.info('Starting relationship extraction', {
      userId,
      emailCount: emails.length,
    });
    
    // Step 1: Group emails by person
    const groupedEmails = groupEmailsByPerson(emails, userEmail, this.config);
    
    logger.info('Grouped emails by person', {
      userId,
      uniqueContacts: groupedEmails.size,
    });
    
    // Step 2: Build relationships
    const relationships: Relationship[] = [];
    
    for (const [contactEmail, contactEmails] of groupedEmails) {
      // Skip if below threshold
      if (contactEmails.length < this.config.minMessagesThreshold) {
        continue;
      }
      
      try {
        const relationship = await this.buildRelationship(
          contactEmail,
          contactEmails,
          userId,
          userEmail
        );
        
        relationships.push(relationship);
      } catch (error) {
        logger.error('Failed to build relationship', {
          userId,
          contactEmail,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }
    
    // Step 3: Sort by health score (lowest first for attention)
    relationships.sort((a, b) => a.healthScore - b.healthScore);
    
    // Step 4: Categorize
    const categorized = this.categorizeRelationships(relationships);
    
    // Step 5: Calculate stats
    const stats = this.calculateStats(relationships);
    
    logger.info('Relationship extraction complete', {
      userId,
      totalRelationships: relationships.length,
      atRisk: categorized.atRisk.length,
    });
    
    return {
      userId,
      relationships,
      ...categorized,
      stats,
      computedAt: new Date(),
    };
  }
  
  /**
   * Builds a single relationship from emails with one person
   */
  private async buildRelationship(
    contactEmail: string,
    emails: EmailMessage[],
    userId: string,
    userEmail: string
  ): Promise<Relationship> {
    // Create person from most recent email (likely has best name info)
    const sortedEmails = [...emails].sort((a, b) => b.date.getTime() - a.date.getTime());
    const mostRecentEmail = sortedEmails[0];
    
    // Find the contact in from/to fields
    let personString = contactEmail;
    if (mostRecentEmail.isFromUser) {
      personString = mostRecentEmail.to.find(t => t.toLowerCase().includes(contactEmail)) || contactEmail;
    } else {
      personString = mostRecentEmail.from;
    }
    
    const contact = createPerson(personString);
    
    // Build time series
    const rawTimeSeries = buildTimeSeries(emails, this.config);
    
    // Fill gaps for accurate trajectory
    const oldestEmail = sortedEmails[sortedEmails.length - 1];
    const filledTimeSeries = fillTimeSeriesGaps(
      rawTimeSeries,
      oldestEmail.date,
      new Date()
    );
    
    // Compute trajectory
    const trajectory = computeTrajectory(filledTimeSeries, emails);
    
    // Extract commitments if enabled
    let commitments: Relationship['commitments'] = [];
    if (this.config.extractCommitments) {
      // Only analyze recent emails for commitments (last 90 days)
      const recentEmails = emails.filter(
        e => daysBetween(e.date, new Date()) <= 90
      );
      commitments = await extractCommitmentsFromEmails(recentEmails, userId, userEmail);
    }
    
    const openCommitments = commitments.filter(
      c => c.status === 'pending' || c.status === 'overdue'
    );
    
    // Determine health status
    const healthStatus = determineHealthStatus(trajectory, openCommitments);
    const healthScore = calculateHealthScore(trajectory, healthStatus, openCommitments);
    
    // Predict future state
    const prediction = predictRelationshipState(trajectory, openCommitments, 30);
    
    return {
      id: generateId(),
      userId,
      contact,
      trajectory,
      commitments,
      openCommitments,
      healthStatus,
      healthScore,
      predictedStatusIn30Days: prediction.predictedStatus,
      daysUntilDormant: prediction.daysUntilDormant,
      firstInteraction: oldestEmail.date,
      lastInteraction: mostRecentEmail.date,
      totalMessages: emails.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Categorizes relationships by health status
   */
  private categorizeRelationships(relationships: Relationship[]): {
    thriving: Relationship[];
    strong: Relationship[];
    stable: Relationship[];
    atRisk: Relationship[];
    decaying: Relationship[];
    dormant: Relationship[];
  } {
    return {
      thriving: relationships.filter(r => r.healthStatus === 'thriving'),
      strong: relationships.filter(r => r.healthStatus === 'strong'),
      stable: relationships.filter(r => r.healthStatus === 'stable' || r.healthStatus === 'cooling'),
      atRisk: relationships.filter(r => r.healthStatus === 'at_risk'),
      decaying: relationships.filter(r => r.healthStatus === 'decaying'),
      dormant: relationships.filter(r => r.healthStatus === 'dormant'),
    };
  }
  
  /**
   * Calculates aggregate statistics
   */
  private calculateStats(relationships: Relationship[]): RelationshipStats {
    const healthBreakdown: Record<RelationshipHealthStatus, number> = {
      thriving: 0,
      strong: 0,
      stable: 0,
      cooling: 0,
      decaying: 0,
      at_risk: 0,
      dormant: 0,
      new: 0,
    };
    
    let totalOpenCommitments = 0;
    let overdueCommitments = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let totalMessagesPerWeek = 0;
    let relationshipsGrowing = 0;
    let relationshipsDecaying = 0;
    
    for (const relationship of relationships) {
      healthBreakdown[relationship.healthStatus]++;
      
      totalOpenCommitments += relationship.openCommitments.length;
      overdueCommitments += relationship.openCommitments.filter(c => c.status === 'overdue').length;
      
      if (relationship.trajectory.avgResponseTimeMinutes !== null) {
        totalResponseTime += relationship.trajectory.avgResponseTimeMinutes;
        responseTimeCount++;
      }
      
      totalMessagesPerWeek += relationship.trajectory.avgMessagesPerWeek;
      
      if (relationship.trajectory.currentVelocity > 0.2) {
        relationshipsGrowing++;
      } else if (relationship.trajectory.currentVelocity < -0.2) {
        relationshipsDecaying++;
      }
    }
    
    const activeRelationships = relationships.filter(
      r => r.healthStatus !== 'dormant'
    ).length;
    
    return {
      totalRelationships: relationships.length,
      activeRelationships,
      healthBreakdown,
      totalOpenCommitments,
      overdueCommitments,
      avgResponseTimeMinutes: responseTimeCount > 0 
        ? Math.round(totalResponseTime / responseTimeCount) 
        : 0,
      avgMessagesPerWeek: relationships.length > 0
        ? Math.round((totalMessagesPerWeek / relationships.length) * 10) / 10
        : 0,
      relationshipsGrowing,
      relationshipsDecaying,
    };
  }
}

/**
 * Convenience function for one-off extraction
 */
export async function extractRelationshipMap(
  emails: EmailMessage[],
  userId: string,
  userEmail: string,
  config?: Partial<ExtractionConfig>
): Promise<RelationshipMap> {
  const extractor = new RelationshipExtractor(config);
  return extractor.extractRelationships(emails, userId, userEmail);
}

