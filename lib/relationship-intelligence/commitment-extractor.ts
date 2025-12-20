import OpenAI from 'openai';
import { Commitment, EmailMessage } from './types';
import { generateId } from './utils';
import { sanitizeForPrompt } from '@/lib/utils/prompt-sanitization';
import { trackAIUsage } from '@/lib/observability/ai-cost-tracker';
import { logger } from '@/lib/observability/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const COMMITMENT_EXTRACTION_PROMPT = `You are analyzing an email to extract commitments and promises.

A commitment is when someone says they will do something. Look for:
- "I'll send you..."
- "I will follow up..."
- "Let me get back to you..."
- "I'll check and..."
- "Will do"
- "I'll make sure..."
- "I promise to..."
- Any future tense statement about an action they will take

For each commitment found, extract:
1. The exact commitment text
2. Who made it (sender or recipient based on context)
3. Any mentioned deadline or timeframe
4. Brief context

IMPORTANT:
- Only extract ACTUAL commitments, not hypotheticals or suggestions
- Ignore automated signatures, disclaimers, and boilerplate
- If someone says "let me know if you need anything" that's NOT a commitment
- Focus on concrete, actionable promises

EMAIL:
From: {{from}}
To: {{to}}
Subject: {{subject}}
Date: {{date}}
Body:
{{body}}

Respond with JSON only:
{
  "commitments": [
    {
      "text": "exact quote of the commitment",
      "madeBy": "sender" | "recipient",
      "deadline": "YYYY-MM-DD" | null,
      "context": "brief surrounding context",
      "confidence": 0.0 to 1.0
    }
  ]
}

If no commitments found, return: {"commitments": []}`;

interface ExtractedCommitment {
  text: string;
  madeBy: 'sender' | 'recipient';
  deadline: string | null;
  context: string;
  confidence: number;
}

interface ExtractionResult {
  commitments: ExtractedCommitment[];
}

/**
 * Extracts commitments from a batch of emails
 */
export async function extractCommitmentsFromEmails(
  emails: EmailMessage[],
  userId: string,
  userEmail: string
): Promise<Commitment[]> {
  const allCommitments: Commitment[] = [];
  
  // Process in batches to avoid rate limits
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(email => 
      extractCommitmentsFromEmail(email, userId, userEmail)
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const commitments of batchResults) {
      allCommitments.push(...commitments);
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return allCommitments;
}

/**
 * Extracts commitments from a single email
 */
async function extractCommitmentsFromEmail(
  email: EmailMessage,
  userId: string,
  userEmail: string
): Promise<Commitment[]> {
  // Skip very short emails (unlikely to have commitments)
  if (email.body.length < 50) {
    return [];
  }
  
  // Skip automated/notification emails
  const lowerBody = email.body.toLowerCase();
  if (
    lowerBody.includes('unsubscribe') ||
    lowerBody.includes('automated message') ||
    lowerBody.includes('do not reply')
  ) {
    return [];
  }
  
  try {
    const prompt = COMMITMENT_EXTRACTION_PROMPT
      .replace('{{from}}', email.from)
      .replace('{{to}}', email.to.join(', '))
      .replace('{{subject}}', email.subject)
      .replace('{{date}}', email.date.toISOString())
      .replace('{{body}}', sanitizeForPrompt(email.body, 3000));
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Use mini for cost efficiency
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,  // Low temperature for consistency
      response_format: { type: 'json_object' },
    });
    
    // Track usage
    if (response.usage) {
      await trackAIUsage(
        userId,
        'commitment-extraction',
        'gpt-4o-mini',
        response.usage
      );
    }
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }
    
    const result: ExtractionResult = JSON.parse(content);
    
    // Convert to Commitment objects
    return result.commitments
      .filter(c => c.confidence >= 0.6)  // Only high-confidence commitments
      .map(c => convertToCommitment(c, email, userEmail));
    
  } catch (error) {
    logger.error('Failed to extract commitments from email', {
      emailId: email.id,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

/**
 * Converts extracted commitment to Commitment object
 */
function convertToCommitment(
  extracted: ExtractedCommitment,
  email: EmailMessage,
  userEmail: string
): Commitment {
  const senderEmail = email.from.toLowerCase();
  const isFromUser = senderEmail.includes(userEmail.toLowerCase());
  
  // Determine direction
  let direction: 'outbound' | 'inbound';
  if (extracted.madeBy === 'sender') {
    direction = isFromUser ? 'outbound' : 'inbound';
  } else {
    direction = isFromUser ? 'inbound' : 'outbound';
  }
  
  // Parse deadline
  let dueDate: Date | null = null;
  if (extracted.deadline) {
    try {
      dueDate = new Date(extracted.deadline);
      if (isNaN(dueDate.getTime())) {
        dueDate = null;
      }
    } catch {
      dueDate = null;
    }
  }
  
  // Determine status
  let status: Commitment['status'] = 'pending';
  if (dueDate && dueDate < new Date()) {
    status = 'overdue';
  }
  
  return {
    id: generateId(),
    direction,
    commitmentText: extracted.text,
    context: extracted.context,
    sourceMessageId: email.id,
    sourceSubject: email.subject,
    sourceDate: email.date,
    detectedDate: new Date(),
    dueDate,
    status,
    fulfilledDate: null,
    confidence: extracted.confidence,
  };
}

/**
 * Updates commitment statuses based on new emails
 * (Check if commitments have been fulfilled)
 */
export async function updateCommitmentStatuses(
  commitments: Commitment[],
  recentEmails: EmailMessage[],
  userId: string
): Promise<Commitment[]> {
  const pendingCommitments = commitments.filter(c => c.status === 'pending' || c.status === 'overdue');
  
  if (pendingCommitments.length === 0 || recentEmails.length === 0) {
    return commitments;
  }
  
  // For each pending commitment, check if recent emails indicate fulfillment
  const updatedCommitments = [...commitments];
  
  for (const commitment of pendingCommitments) {
    const isFulfilled = await checkCommitmentFulfillment(commitment, recentEmails, userId);
    
    if (isFulfilled) {
      const index = updatedCommitments.findIndex(c => c.id === commitment.id);
      if (index !== -1) {
        updatedCommitments[index] = {
          ...updatedCommitments[index],
          status: 'fulfilled',
          fulfilledDate: new Date(),
        };
      }
    }
  }
  
  return updatedCommitments;
}

/**
 * Checks if a commitment has been fulfilled based on recent emails
 */
async function checkCommitmentFulfillment(
  commitment: Commitment,
  recentEmails: EmailMessage[],
  userId: string
): Promise<boolean> {
  // Simple heuristic first: check if there's a follow-up email mentioning the commitment
  const relevantEmails = recentEmails.filter(e => 
    e.date > commitment.sourceDate &&
    (e.subject.toLowerCase().includes(commitment.sourceSubject.toLowerCase().slice(0, 20)) ||
     e.body.toLowerCase().includes(commitment.commitmentText.toLowerCase().slice(0, 30)))
  );
  
  if (relevantEmails.length === 0) {
    return false;
  }
  
  // For now, use a simple heuristic: if there's a follow-up email with attachments
  // or certain keywords, consider it potentially fulfilled
  // A more sophisticated version would use AI to verify
  
  const fulfillmentIndicators = [
    'attached',
    'here is',
    'here\'s',
    'as promised',
    'as discussed',
    'following up',
    'sent',
    'completed',
    'done',
  ];
  
  for (const email of relevantEmails) {
    const lowerBody = email.body.toLowerCase();
    const hasIndicator = fulfillmentIndicators.some(ind => lowerBody.includes(ind));
    
    if (hasIndicator) {
      return true;
    }
  }
  
  return false;
}

