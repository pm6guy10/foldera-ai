// ============================================
// RELATIONSHIP INTELLIGENCE - BARREL EXPORTS
// ============================================

export * from './types';
export { RelationshipExtractor, extractRelationshipMap } from './extractor';
export { fetchGmailMessages, fetchOutlookMessages, fetchAllEmails } from './email-fetcher';
export { extractCommitmentsFromEmails, updateCommitmentStatuses } from './commitment-extractor';
export { buildTimeSeries, fillTimeSeriesGaps, calculateTimeSeriesStats } from './time-series';
export { 
  computeTrajectory, 
  calculateVelocity, 
  determineHealthStatus, 
  calculateHealthScore,
  predictRelationshipState 
} from './trajectory';
export * from './utils';

