// =====================================================
// CONTEXT ENGINE - Graph Processor
// The Brain: Connects the dots across all sources
// =====================================================

import OpenAI from 'openai';
import type { 
  WorkSignal, 
  BriefingObject,
  ContextBucket,
  SignalPriority 
} from '@/lib/types/universal-graph';

/**
 * Ingest Signals
 * 
 * Takes a batch of mixed signals from different sources (Gmail, Slack, Linear, etc.)
 * and uses AI to organize them into Context Buckets.
 * 
 * Example: If Email A talks about 'Project X' and Slack Message B complains 
 * about 'Bug in X', they'll be grouped together in a "Project X Issues" bucket.
 * 
 * @param signals - Array of work signals to process (mixed sources)
 * @param openaiClient - OpenAI client instance
 * @returns Briefing object with organized context buckets
 */
export async function ingestSignals(
  signals: WorkSignal[],
  openaiClient: OpenAI
): Promise<BriefingObject> {
  const startTime = Date.now();

  if (!signals || signals.length === 0) {
    return {
      buckets: [],
      totalSignals: 0,
      relationships: [],
      generatedAt: new Date(),
    };
  }

  try {
    // Format signals for AI analysis
    const signalsText = signals.map((signal, index) => {
      return `Signal ${index + 1}:
ID: ${signal.id}
Source: ${signal.source}
Author: ${signal.author}
Timestamp: ${signal.timestamp.toISOString()}
Content: ${signal.content.substring(0, 500)}${signal.content.length > 500 ? '...' : ''}
URL: ${signal.url}
---
`;
    }).join('\n');

    // God Mode System Prompt
    const systemPrompt = `You are the Foldera Knowledge Graph.
Your job is to Connect the Dots.

Look at these mixed signals from different sources (Gmail, Slack, Linear, Notion, Calendar). Find the relationships.

Example Logic:
- If Email A talks about 'Project X' and Slack Message B complains about 'Bug in X', LINK THEM.
- If Calendar Event C is 'Project X Launch', mark Email A as URGENT.
- Group related signals into logical "Context Buckets" (e.g., 'Project Phoenix Update', 'Hiring Issues', 'Budget Concerns').

OUTPUT FORMAT (JSON):
{
  "buckets": [
    {
      "name": "Project Phoenix Update",
      "description": "All signals related to Project Phoenix launch and issues",
      "signal_ids": ["gmail:123", "slack:456", "calendar:789"],
      "priority": "HIGH",
      "last_activity": "2025-11-21T03:00:00Z"
    }
  ],
  "relationships": [
    {
      "signal_id": "gmail:123",
      "related_signal_id": "slack:456",
      "reason": "Both discuss the same Project Phoenix bug"
    }
  ],
  "signal_updates": [
    {
      "signal_id": "gmail:123",
      "summary": "Email about urgent Project Phoenix bug fix",
      "status": "OPEN",
      "priority": "HIGH"
    }
  ]
}`;

    // Call OpenAI
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Analyze these ${signals.length} mixed work signals and organize them:\n\n${signalsText}`,
        },
      ],
      temperature: 0.7,
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';

    // Parse JSON response
    let jsonText = aiResponse.trim();
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonText);

    // Build Context Buckets
    const buckets: ContextBucket[] = (analysis.buckets || []).map((bucket: any) => ({
      name: bucket.name,
      description: bucket.description || '',
      signalIds: bucket.signal_ids || [],
      priority: (bucket.priority || 'MEDIUM') as SignalPriority,
      lastActivity: new Date(bucket.last_activity || Date.now()),
    }));

    // Update signals with AI-generated summaries and status/priority
    const signalUpdates = analysis.signal_updates || [];
    const signalMap = new Map<string, WorkSignal>();
    
    signals.forEach(signal => signalMap.set(signal.id, signal));
    
    // Apply AI updates to signals
    signalUpdates.forEach((update: any) => {
      const signal = signalMap.get(update.signal_id);
      if (signal) {
        signal.summary = update.summary || signal.summary;
        signal.status = update.status || signal.status;
        signal.priority = update.priority || signal.priority;
      }
    });

    // Build relationships
    const relationships = (analysis.relationships || []).map((rel: any) => ({
      signalId: rel.signal_id,
      relatedSignalId: rel.related_signal_id,
      reason: rel.reason || 'Related by context',
    }));

    return {
      buckets,
      totalSignals: signals.length,
      relationships,
      generatedAt: new Date(),
    };

  } catch (error: any) {
    console.error('[Graph Processor] Error processing signals:', error);
    
    // Return empty briefing on error
    return {
      buckets: [],
      totalSignals: signals.length,
      relationships: [],
      generatedAt: new Date(),
    };
  }
}

/**
 * Get Highest Priority Bucket
 * 
 * Returns the bucket with the highest priority signal
 */
export function getHighestPriorityBucket(briefing: BriefingObject): ContextBucket | null {
  if (briefing.buckets.length === 0) return null;

  const priorityOrder: Record<SignalPriority, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return briefing.buckets.reduce((highest, current) => {
    return priorityOrder[current.priority] > priorityOrder[highest.priority] 
      ? current 
      : highest;
  });
}

/**
 * Get Signals by Bucket
 * 
 * Retrieves all signals that belong to a specific bucket
 */
export function getSignalsByBucket(
  bucket: ContextBucket,
  allSignals: WorkSignal[]
): WorkSignal[] {
  return allSignals.filter(signal => bucket.signalIds.includes(signal.id));
}

