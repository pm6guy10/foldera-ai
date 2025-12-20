import { 
  TimeSeriesPoint, 
  EmailMessage, 
  ExtractionConfig,
  DEFAULT_EXTRACTION_CONFIG 
} from './types';
import { 
  generateWeekBuckets, 
  minutesBetween, 
  average,
  daysBetween 
} from './utils';

/**
 * Builds a time series of interaction data from a list of emails with one person
 */
export function buildTimeSeries(
  emails: EmailMessage[],
  config: ExtractionConfig = DEFAULT_EXTRACTION_CONFIG
): TimeSeriesPoint[] {
  if (emails.length === 0) {
    return [];
  }
  
  // Sort emails by date
  const sortedEmails = [...emails].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  
  // Determine date range
  const startDate = sortedEmails[0].date;
  const endDate = sortedEmails[sortedEmails.length - 1].date;
  
  // Generate weekly buckets
  const buckets = generateWeekBuckets(startDate, endDate);
  
  // Build time series
  const timeSeries: TimeSeriesPoint[] = [];
  
  for (const bucket of buckets) {
    // Get emails in this bucket
    const bucketEmails = sortedEmails.filter(
      e => e.date >= bucket.start && e.date <= bucket.end
    );
    
    // Count messages
    const messagesSent = bucketEmails.filter(e => e.isFromUser).length;
    const messagesReceived = bucketEmails.filter(e => !e.isFromUser).length;
    
    // Calculate response times
    const responseTimes = calculateResponseTimes(bucketEmails);
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(average(responseTimes))
      : null;
    
    // Count thread initiations (first message in a thread)
    const { initiatedByYou, initiatedByThem } = countInitiations(bucketEmails);
    
    timeSeries.push({
      periodStart: bucket.start,
      periodEnd: bucket.end,
      messagesSent,
      messagesReceived,
      totalMessages: messagesSent + messagesReceived,
      avgResponseTimeMinutes: avgResponseTime,
      initiatedByYou,
      initiatedByThem,
      sentimentScore: null,  // Populated later if sentiment analysis enabled
    });
  }
  
  return timeSeries;
}

/**
 * Calculates response times between messages
 * Returns array of response times in minutes
 */
function calculateResponseTimes(emails: EmailMessage[]): number[] {
  if (emails.length < 2) return [];
  
  const sortedByThread = new Map<string, EmailMessage[]>();
  
  // Group by thread
  for (const email of emails) {
    if (!sortedByThread.has(email.threadId)) {
      sortedByThread.set(email.threadId, []);
    }
    sortedByThread.get(email.threadId)!.push(email);
  }
  
  const responseTimes: number[] = [];
  
  // For each thread, calculate response times
  for (const [, threadEmails] of sortedByThread) {
    const sorted = threadEmails.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      // Only count if it's a response (different sender)
      if (prev.isFromUser !== curr.isFromUser) {
        const responseTime = minutesBetween(prev.date, curr.date);
        
        // Ignore very long "responses" (probably not actual responses)
        if (responseTime < 7 * 24 * 60) {  // Less than 7 days
          responseTimes.push(responseTime);
        }
      }
    }
  }
  
  return responseTimes;
}

/**
 * Counts who initiated conversations (first message in threads)
 */
function countInitiations(emails: EmailMessage[]): { initiatedByYou: number; initiatedByThem: number } {
  const threadFirstMessages = new Map<string, EmailMessage>();
  
  // Find first message in each thread
  for (const email of emails) {
    const existing = threadFirstMessages.get(email.threadId);
    if (!existing || email.date < existing.date) {
      threadFirstMessages.set(email.threadId, email);
    }
  }
  
  let initiatedByYou = 0;
  let initiatedByThem = 0;
  
  for (const [, firstMessage] of threadFirstMessages) {
    if (firstMessage.isFromUser) {
      initiatedByYou++;
    } else {
      initiatedByThem++;
    }
  }
  
  return { initiatedByYou, initiatedByThem };
}

/**
 * Fills gaps in time series with zero-activity points
 * Important for accurate trajectory calculation
 */
export function fillTimeSeriesGaps(
  timeSeries: TimeSeriesPoint[],
  startDate: Date,
  endDate: Date
): TimeSeriesPoint[] {
  if (timeSeries.length === 0) {
    return [];
  }
  
  const allBuckets = generateWeekBuckets(startDate, endDate);
  const existingByStart = new Map(
    timeSeries.map(p => [p.periodStart.getTime(), p])
  );
  
  const filled: TimeSeriesPoint[] = [];
  
  for (const bucket of allBuckets) {
    const existing = existingByStart.get(bucket.start.getTime());
    
    if (existing) {
      filled.push(existing);
    } else {
      // Create empty point for this period
      filled.push({
        periodStart: bucket.start,
        periodEnd: bucket.end,
        messagesSent: 0,
        messagesReceived: 0,
        totalMessages: 0,
        avgResponseTimeMinutes: null,
        initiatedByYou: 0,
        initiatedByThem: 0,
        sentimentScore: null,
      });
    }
  }
  
  return filled;
}

/**
 * Calculates aggregate statistics from a time series
 */
export function calculateTimeSeriesStats(timeSeries: TimeSeriesPoint[]): {
  avgMessagesPerWeek: number;
  avgResponseTimeMinutes: number | null;
  totalMessages: number;
  initiationRatio: number;
} {
  if (timeSeries.length === 0) {
    return {
      avgMessagesPerWeek: 0,
      avgResponseTimeMinutes: null,
      totalMessages: 0,
      initiationRatio: 0.5,
    };
  }
  
  const totalMessages = timeSeries.reduce((sum, p) => sum + p.totalMessages, 0);
  const avgMessagesPerWeek = totalMessages / timeSeries.length;
  
  // Average response time (only from points that have data)
  const responseTimes = timeSeries
    .filter(p => p.avgResponseTimeMinutes !== null)
    .map(p => p.avgResponseTimeMinutes!);
  const avgResponseTimeMinutes = responseTimes.length > 0
    ? Math.round(average(responseTimes))
    : null;
  
  // Initiation ratio
  const totalInitiatedByYou = timeSeries.reduce((sum, p) => sum + p.initiatedByYou, 0);
  const totalInitiatedByThem = timeSeries.reduce((sum, p) => sum + p.initiatedByThem, 0);
  const totalInitiations = totalInitiatedByYou + totalInitiatedByThem;
  const initiationRatio = totalInitiations > 0
    ? totalInitiatedByYou / totalInitiations
    : 0.5;
  
  return {
    avgMessagesPerWeek,
    avgResponseTimeMinutes,
    totalMessages,
    initiationRatio,
  };
}

