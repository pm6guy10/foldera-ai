import { 
  RelationshipTrajectory, 
  TimeSeriesPoint,
  RelationshipHealthStatus,
  RelationshipPrediction,
  Commitment
} from './types';
import { 
  calculateTimeSeriesStats, 
  fillTimeSeriesGaps 
} from './time-series';
import { daysBetween, average, clamp } from './utils';

/**
 * Computes the trajectory of a relationship from its time series
 */
export function computeTrajectory(
  timeSeries: TimeSeriesPoint[],
  allEmails: { date: Date }[]
): RelationshipTrajectory {
  if (timeSeries.length === 0) {
    return createEmptyTrajectory();
  }
  
  // Calculate basic stats
  const stats = calculateTimeSeriesStats(timeSeries);
  
  // Calculate velocity (rate of change in messages per week)
  const velocity = calculateVelocity(timeSeries);
  
  // Calculate acceleration (change in velocity)
  const acceleration = calculateAcceleration(timeSeries);
  
  // Calculate normal contact frequency
  const normalContactFrequencyDays = calculateNormalContactFrequency(timeSeries);
  
  // Days since last contact
  const sortedEmails = [...allEmails].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastContactDate = sortedEmails.length > 0 ? sortedEmails[0].date : new Date();
  const daysSinceLastContact = daysBetween(lastContactDate, new Date());
  
  return {
    timeSeries,
    currentVelocity: velocity,
    acceleration,
    avgMessagesPerWeek: stats.avgMessagesPerWeek,
    avgResponseTimeMinutes: stats.avgResponseTimeMinutes,
    normalContactFrequencyDays,
    daysSinceLastContact,
    initiationRatio: stats.initiationRatio,
  };
}

/**
 * Creates an empty trajectory for new/minimal relationships
 */
function createEmptyTrajectory(): RelationshipTrajectory {
  return {
    timeSeries: [],
    currentVelocity: 0,
    acceleration: 0,
    avgMessagesPerWeek: 0,
    avgResponseTimeMinutes: null,
    normalContactFrequencyDays: 30,
    daysSinceLastContact: 0,
    initiationRatio: 0.5,
  };
}

/**
 * Calculates velocity using linear regression on recent data
 * Velocity = slope of messages per week over time
 * Positive = relationship growing, Negative = declining
 */
export function calculateVelocity(timeSeries: TimeSeriesPoint[]): number {
  // Use last 8 weeks for velocity (more recent = more relevant)
  const recentSeries = timeSeries.slice(-8);
  
  if (recentSeries.length < 2) {
    return 0;
  }
  
  // Simple linear regression
  const n = recentSeries.length;
  const xValues = recentSeries.map((_, i) => i);
  const yValues = recentSeries.map(p => p.totalMessages);
  
  const xMean = average(xValues);
  const yMean = average(yValues);
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
    denominator += (xValues[i] - xMean) ** 2;
  }
  
  if (denominator === 0) {
    return 0;
  }
  
  // Slope = change in messages per week
  const slope = numerator / denominator;
  
  // Round to 2 decimal places
  return Math.round(slope * 100) / 100;
}

/**
 * Calculates acceleration (change in velocity over time)
 */
export function calculateAcceleration(timeSeries: TimeSeriesPoint[]): number {
  if (timeSeries.length < 6) {
    return 0;
  }
  
  // Split into two halves and compare velocities
  const midpoint = Math.floor(timeSeries.length / 2);
  const firstHalf = timeSeries.slice(0, midpoint);
  const secondHalf = timeSeries.slice(midpoint);
  
  const firstVelocity = calculateVelocity(firstHalf);
  const secondVelocity = calculateVelocity(secondHalf);
  
  // Acceleration = change in velocity
  return Math.round((secondVelocity - firstVelocity) * 100) / 100;
}

/**
 * Calculates the normal contact frequency in days
 * (How often do you typically communicate with this person?)
 */
function calculateNormalContactFrequency(timeSeries: TimeSeriesPoint[]): number {
  if (timeSeries.length === 0) {
    return 30;  // Default assumption
  }
  
  // Find weeks with activity
  const activeWeeks = timeSeries.filter(p => p.totalMessages > 0);
  
  if (activeWeeks.length < 2) {
    return 30;
  }
  
  // Calculate gaps between active weeks
  const gaps: number[] = [];
  for (let i = 1; i < activeWeeks.length; i++) {
    const daysDiff = daysBetween(activeWeeks[i - 1].periodStart, activeWeeks[i].periodStart);
    gaps.push(daysDiff);
  }
  
  // Use median gap as "normal" frequency (robust to outliers)
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  
  return clamp(medianGap, 1, 180);  // Between 1 day and 6 months
}

/**
 * Determines health status from trajectory and commitments
 */
export function determineHealthStatus(
  trajectory: RelationshipTrajectory,
  openCommitments: Commitment[]
): RelationshipHealthStatus {
  const { 
    currentVelocity, 
    avgMessagesPerWeek, 
    daysSinceLastContact,
    normalContactFrequencyDays,
    timeSeries
  } = trajectory;
  
  // Not enough data
  if (timeSeries.length < 3) {
    return 'new';
  }
  
  // Check for dormant (no contact in 3x normal frequency or 90 days)
  const dormantThreshold = Math.min(normalContactFrequencyDays * 3, 90);
  if (daysSinceLastContact > dormantThreshold) {
    return 'dormant';
  }
  
  // Check for at risk (decaying + overdue commitments)
  const hasOverdueCommitments = openCommitments.some(
    c => c.status === 'overdue' && c.direction === 'outbound'
  );
  
  if (hasOverdueCommitments && currentVelocity < -0.3) {
    return 'at_risk';
  }
  
  // Check trajectory
  if (currentVelocity > 0.5 && avgMessagesPerWeek > 2) {
    return 'thriving';
  }
  
  if (currentVelocity > 0.2 || (currentVelocity >= 0 && avgMessagesPerWeek > 1)) {
    return 'strong';
  }
  
  if (currentVelocity >= -0.2 && currentVelocity <= 0.2) {
    return 'stable';
  }
  
  if (currentVelocity < -0.5) {
    return 'decaying';
  }
  
  return 'cooling';
}

/**
 * Calculates a numeric health score (0-100) for sorting
 */
export function calculateHealthScore(
  trajectory: RelationshipTrajectory,
  healthStatus: RelationshipHealthStatus,
  openCommitments: Commitment[]
): number {
  let score = 50;  // Start at neutral
  
  // Velocity impact (-20 to +20)
  score += clamp(trajectory.currentVelocity * 20, -20, 20);
  
  // Recency impact (-20 to +10)
  const recencyRatio = trajectory.daysSinceLastContact / trajectory.normalContactFrequencyDays;
  if (recencyRatio < 1) {
    score += 10;  // More recent than normal
  } else if (recencyRatio > 2) {
    score -= 20;  // Way overdue
  } else if (recencyRatio > 1.5) {
    score -= 10;  // Somewhat overdue
  }
  
  // Activity level impact (-10 to +10)
  if (trajectory.avgMessagesPerWeek > 3) {
    score += 10;
  } else if (trajectory.avgMessagesPerWeek < 0.5) {
    score -= 10;
  }
  
  // Commitment impact (-20 to 0)
  const overdueCount = openCommitments.filter(c => c.status === 'overdue').length;
  score -= overdueCount * 10;
  
  // Status overrides
  if (healthStatus === 'dormant') score = Math.min(score, 20);
  if (healthStatus === 'at_risk') score = Math.min(score, 30);
  if (healthStatus === 'thriving') score = Math.max(score, 80);
  
  return clamp(Math.round(score), 0, 100);
}

/**
 * Predicts future relationship state
 */
export function predictRelationshipState(
  trajectory: RelationshipTrajectory,
  openCommitments: Commitment[],
  daysFromNow: number = 30
): RelationshipPrediction {
  const currentStatus = determineHealthStatus(trajectory, openCommitments);
  
  // Project future velocity impact
  const currentRate = trajectory.avgMessagesPerWeek;
  const weeksFromNow = daysFromNow / 7;
  const projectedRate = Math.max(0, currentRate + (trajectory.currentVelocity * weeksFromNow));
  
  // Projected days since contact
  const projectedDaysSinceContact = trajectory.daysSinceLastContact + daysFromNow;
  
  // Create projected trajectory for status determination
  const projectedTrajectory: RelationshipTrajectory = {
    ...trajectory,
    avgMessagesPerWeek: projectedRate,
    daysSinceLastContact: projectedDaysSinceContact,
  };
  
  const predictedStatus = determineHealthStatus(projectedTrajectory, openCommitments);
  
  // Calculate days until dormant (if declining)
  let daysUntilDormant: number | null = null;
  if (trajectory.currentVelocity < 0) {
    const dormantThreshold = Math.min(trajectory.normalContactFrequencyDays * 3, 90);
    const daysUntilDormantFromContact = dormantThreshold - trajectory.daysSinceLastContact;
    
    if (daysUntilDormantFromContact > 0) {
      daysUntilDormant = Math.round(daysUntilDormantFromContact);
    } else {
      daysUntilDormant = 0;  // Already past threshold
    }
  }
  
  // Days until status change
  let daysUntilStatusChange: number | null = null;
  if (currentStatus !== predictedStatus) {
    // Binary search to find when status changes
    daysUntilStatusChange = findStatusChangePoint(trajectory, openCommitments, currentStatus, daysFromNow);
  }
  
  // Confidence based on data points
  const dataPoints = trajectory.timeSeries.length;
  const confidence = clamp(dataPoints / 20, 0.3, 0.95);  // 30% to 95%
  
  // Generate recommendation
  const recommendation = generateRecommendation(
    currentStatus, 
    predictedStatus, 
    trajectory, 
    openCommitments
  );
  
  // Urgency
  const urgency = determineUrgency(currentStatus, predictedStatus, daysUntilDormant, openCommitments);
  
  return {
    currentStatus,
    predictedStatus,
    daysUntilStatusChange,
    daysUntilDormant,
    confidence,
    recommendation,
    urgency,
  };
}

/**
 * Binary search to find when status changes
 */
function findStatusChangePoint(
  trajectory: RelationshipTrajectory,
  openCommitments: Commitment[],
  currentStatus: RelationshipHealthStatus,
  maxDays: number
): number | null {
  let low = 1;
  let high = maxDays;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const projectedDaysSince = trajectory.daysSinceLastContact + mid;
    const projectedRate = Math.max(
      0, 
      trajectory.avgMessagesPerWeek + (trajectory.currentVelocity * (mid / 7))
    );
    
    const projectedTrajectory: RelationshipTrajectory = {
      ...trajectory,
      avgMessagesPerWeek: projectedRate,
      daysSinceLastContact: projectedDaysSince,
    };
    
    const status = determineHealthStatus(projectedTrajectory, openCommitments);
    
    if (status !== currentStatus) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  
  return low < maxDays ? low : null;
}

/**
 * Generates a human-readable recommendation
 */
function generateRecommendation(
  currentStatus: RelationshipHealthStatus,
  predictedStatus: RelationshipHealthStatus,
  trajectory: RelationshipTrajectory,
  openCommitments: Commitment[]
): string {
  const overdueCommitments = openCommitments.filter(c => c.status === 'overdue' && c.direction === 'outbound');
  
  if (overdueCommitments.length > 0) {
    return `You have ${overdueCommitments.length} overdue commitment(s). Address these to restore trust.`;
  }
  
  switch (currentStatus) {
    case 'at_risk':
      return 'This relationship needs immediate attention. Reach out with a personal message.';
    
    case 'decaying':
      return 'This relationship is declining. Consider scheduling a catch-up or sending a quick check-in.';
    
    case 'cooling':
      return 'Interaction frequency is slowing down. A quick message could help maintain momentum.';
    
    case 'dormant':
      return 'This relationship has gone quiet. Decide: reconnect intentionally or acknowledge the natural drift.';
    
    case 'stable':
      if (predictedStatus === 'cooling' || predictedStatus === 'decaying') {
        return 'Currently stable, but trending downward. Stay engaged to maintain the connection.';
      }
      return 'Relationship is healthy. Continue current engagement pattern.';
    
    case 'strong':
      return 'Strong relationship. Keep nurturing it with consistent engagement.';
    
    case 'thriving':
      return 'Excellent relationship health! Your engagement is paying off.';
    
    case 'new':
      return 'New connection. Regular engagement will help establish the relationship.';
    
    default:
      return 'Monitor this relationship and maintain regular contact.';
  }
}

/**
 * Determines urgency level
 */
function determineUrgency(
  currentStatus: RelationshipHealthStatus,
  predictedStatus: RelationshipHealthStatus,
  daysUntilDormant: number | null,
  openCommitments: Commitment[]
): RelationshipPrediction['urgency'] {
  const hasOverdue = openCommitments.some(c => c.status === 'overdue' && c.direction === 'outbound');
  
  if (currentStatus === 'at_risk' || (hasOverdue && currentStatus === 'decaying')) {
    return 'critical';
  }
  
  if (currentStatus === 'decaying' || (daysUntilDormant !== null && daysUntilDormant < 14)) {
    return 'high';
  }
  
  if (currentStatus === 'cooling' || (daysUntilDormant !== null && daysUntilDormant < 30)) {
    return 'medium';
  }
  
  if (predictedStatus !== currentStatus && 
      ['cooling', 'decaying', 'at_risk', 'dormant'].includes(predictedStatus)) {
    return 'low';
  }
  
  return 'none';
}

