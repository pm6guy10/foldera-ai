import OpenAI from 'openai';
import { 
  ShadowSignal, 
  ShadowScanResult, 
  ShadowModeConfig, 
  DEFAULT_SHADOW_CONFIG,
  UrgencyLevel,
  ShadowSignalType 
} from './types';
import { EmailMessage } from '@/lib/relationship-intelligence/types';
import { fetchAllEmails } from '@/lib/relationship-intelligence/email-fetcher';
import { sanitizeEmailForPrompt } from '@/lib/utils/prompt-sanitization';
import { trackAIUsage } from '@/lib/observability/ai-cost-tracker';
import { logger } from '@/lib/observability/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SHADOW_ANALYST_PROMPT = `You are a Chief of Staff AI analyzing email threads for your executive.

Your job is to detect signals that require attention or awareness. You are PROACTIVE - you tap them on the shoulder before they even know there's a problem.

## Signal Types to Detect:

1. **commitment_made**: The user promised to do something
2. **commitment_received**: Someone promised the user something
3. **deadline_approaching**: An explicit or implied deadline is mentioned
4. **ghosting_risk**: User sent the last message, thread has gone quiet
5. **vip_escalation**: Important contact showing urgency or frustration
6. **sentiment_shift**: Tone turned negative or concerning
7. **context_update**: Background information worth knowing (no action needed)

## Instructions:

Analyze this email thread and identify ANY signals present. For each signal:
- Determine urgency: critical (act now), high (today), medium (this week), low (when convenient), context (just FYI)
- Write a clear, actionable title (max 10 words)
- Explain why this matters
- Recommend a specific action
- If appropriate, draft a response message

Be thorough but not paranoid. If the thread is routine, just note context signals.

## Thread to Analyze:

Subject: {{subject}}
Participants: {{participants}}
Last Activity: {{lastActivity}}
User's Last Message: {{userLastMessageDate}}

Messages (newest first):
{{messages}}

## Response Format (JSON only):

{
  "signals": [
    {
      "type": "commitment_made | commitment_received | deadline_approaching | ghosting_risk | vip_escalation | sentiment_shift | context_update",
      "urgency": "critical | high | medium | low | context",
      "title": "Brief actionable title",
      "description": "Why this matters",
      "commitmentText": "The exact promise if applicable",
      "dueDate": "YYYY-MM-DD or null",
      "recommendedAction": "What to do",
      "draftMessage": "Optional draft response",
      "confidence": 0.0 to 1.0
    }
  ]
}

If no signals detected, return: {"signals": []}`;

interface ThreadGroup {
  threadId: string;
  subject: string;
  participants: string[];
  messages: EmailMessage[];
  lastActivity: Date;
  userLastMessageDate: Date | null;
}

/**
 * Main Shadow Mode scanner
 */
export async function runShadowScan(
  userId: string,
  userEmail: string,
  config: Partial<ShadowModeConfig> = {}
): Promise<ShadowScanResult> {
  const startTime = Date.now();
  const scanConfig = { ...DEFAULT_SHADOW_CONFIG, ...config };
  const scanId = `scan_${Date.now()}`;
  
  logger.info('Starting Shadow Mode scan', { userId, scanId });
  
  // Fetch recent emails
  const lookbackDays = Math.ceil(scanConfig.lookbackHours / 24);
  const emails = await fetchAllEmails(userId, userEmail, lookbackDays);
  
  // Limit for cost control
  const limitedEmails = emails.slice(0, scanConfig.maxEmailsPerScan);
  
  logger.info('Emails fetched for scan', { 
    userId, 
    total: emails.length, 
    analyzing: limitedEmails.length 
  });
  
  // Group by thread
  const threads = groupByThread(limitedEmails, userEmail);
  
  // Analyze threads (with AI call limit)
  const signals: ShadowSignal[] = [];
  let aiCallCount = 0;
  
  for (const thread of threads) {
    if (aiCallCount >= scanConfig.maxAiCallsPerScan) {
      logger.warn('AI call limit reached', { userId, scanId, limit: scanConfig.maxAiCallsPerScan });
      break;
    }
    
    // Skip very short threads (likely automated)
    if (thread.messages.length < 2 && !isLikelyImportant(thread)) {
      continue;
    }
    
    const threadSignals = await analyzeThread(thread, userId, userEmail, scanConfig);
    signals.push(...threadSignals);
    aiCallCount++;
  }
  
  // Categorize
  const critical = signals.filter(s => s.urgency === 'critical');
  const actionRequired = signals.filter(s => ['critical', 'high', 'medium'].includes(s.urgency));
  const context = signals.filter(s => s.urgency === 'context' || s.urgency === 'low');
  
  const result: ShadowScanResult = {
    userId,
    scanId,
    signals,
    critical,
    actionRequired,
    context,
    emailsScanned: limitedEmails.length,
    threadsAnalyzed: aiCallCount,
    scanDurationMs: Date.now() - startTime,
    scannedAt: new Date(),
    nextScanAt: new Date(Date.now() + scanConfig.scanIntervalMinutes * 60 * 1000),
  };
  
  logger.info('Shadow Mode scan complete', {
    userId,
    scanId,
    signalsFound: signals.length,
    critical: critical.length,
    durationMs: result.scanDurationMs,
  });
  
  return result;
}

/**
 * Groups emails by thread
 */
function groupByThread(emails: EmailMessage[], userEmail: string): ThreadGroup[] {
  const threadMap = new Map<string, EmailMessage[]>();
  
  for (const email of emails) {
    if (!threadMap.has(email.threadId)) {
      threadMap.set(email.threadId, []);
    }
    threadMap.get(email.threadId)!.push(email);
  }
  
  const threads: ThreadGroup[] = [];
  
  for (const [threadId, messages] of threadMap) {
    const sorted = messages.sort((a, b) => b.date.getTime() - a.date.getTime());
    const participants = [...new Set(
      messages.flatMap(m => [m.from, ...m.to]).map(e => e.toLowerCase())
    )];
    
    const userMessages = sorted.filter(m => m.isFromUser);
    const userLastMessageDate = userMessages.length > 0 ? userMessages[0].date : null;
    
    threads.push({
      threadId,
      subject: sorted[0].subject,
      participants,
      messages: sorted,
      lastActivity: sorted[0].date,
      userLastMessageDate,
    });
  }
  
  // Sort by last activity (most recent first)
  return threads.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}

/**
 * Checks if a thread is likely important (even if short)
 */
function isLikelyImportant(thread: ThreadGroup): boolean {
  const subject = thread.subject.toLowerCase();
  
  const urgentKeywords = [
    'urgent', 'asap', 'important', 'deadline', 
    'overdue', 'reminder', 'action required'
  ];
  
  return urgentKeywords.some(kw => subject.includes(kw));
}

/**
 * Analyzes a single thread for signals
 */
async function analyzeThread(
  thread: ThreadGroup,
  userId: string,
  userEmail: string,
  config: ShadowModeConfig
): Promise<ShadowSignal[]> {
  // Format messages for prompt
  const messagesText = thread.messages
    .slice(0, 10) // Limit messages per thread
    .map(m => {
      const sender = m.isFromUser ? 'YOU' : m.from;
      const date = m.date.toISOString().split('T')[0];
      const body = sanitizeEmailForPrompt(m.body, 500);
      return `[${date}] ${sender}:\n${body}`;
    })
    .join('\n\n---\n\n');
  
  const prompt = SHADOW_ANALYST_PROMPT
    .replace('{{subject}}', thread.subject)
    .replace('{{participants}}', thread.participants.join(', '))
    .replace('{{lastActivity}}', thread.lastActivity.toISOString())
    .replace('{{userLastMessageDate}}', thread.userLastMessageDate?.toISOString() || 'Never')
    .replace('{{messages}}', messagesText);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    
    if (response.usage) {
      await trackAIUsage(userId, 'shadow-scan', 'gpt-4o-mini', response.usage);
    }
    
    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    
    const result = JSON.parse(content);
    
    // Convert to ShadowSignal objects
    return (result.signals || [])
      .filter((s: any) => s.confidence >= 0.6)
      .map((s: any): ShadowSignal => ({
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: s.type as ShadowSignalType,
        urgency: s.urgency as UrgencyLevel,
        title: s.title,
        description: s.description,
        contactEmail: thread.participants.find(p => !p.includes(userEmail.toLowerCase())) || '',
        contactName: null,
        threadSubject: thread.subject,
        sourceProvider: 'google', // TODO: Detect from email source
        commitmentText: s.commitmentText,
        dueDate: s.dueDate ? new Date(s.dueDate) : undefined,
        recommendedAction: s.recommendedAction,
        draftMessage: s.draftMessage,
        detectedAt: new Date(),
        sourceMessageId: thread.messages[0].id,
        confidence: s.confidence,
      }));
  } catch (error) {
    logger.error('Failed to analyze thread', {
      threadId: thread.threadId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

