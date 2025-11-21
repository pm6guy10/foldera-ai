// =====================================================
// CONTEXT ENGINE - Signal Processor
// The Brain: Analyzes and connects work signals
// =====================================================
//
// USAGE EXAMPLE:
// ```typescript
// import { processSignals, normalizeSignal } from '@/lib/ingest/processor';
// import OpenAI from 'openai';
//
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
//
// // Normalize signals from different sources
// const emailSignal = normalizeSignal({
//   id: 'msg_123',
//   author: 'john@example.com',
//   timestamp: new Date(),
//   content: 'We need to fix the bug in Project Phoenix by Friday',
//   title: 'Urgent: Bug fix needed'
// }, 'gmail');
//
// const slackSignal = normalizeSignal({
//   id: 'msg_456',
//   author: '@sarah',
//   timestamp: new Date(),
//   content: 'Just saw the Phoenix bug - looks critical',
// }, 'slack');
//
// // Process together - AI will connect them
// const { enrichedSignals, result } = await processSignals(
//   [emailSignal, slackSignal],
//   openai
// );
//
// // enrichedSignals will have:
// // - context_tags: ["Project Phoenix", "Urgent", "Bug"]
// // - relationships: linking email to slack message
// ```
//

import OpenAI from 'openai';
import type { 
  WorkSignal, 
  SignalRelationship, 
  ProcessingResult,
  SignalBatch,
  WorkSignalSource 
} from '@/lib/types/universal-graph';

/**
 * Process Signals
 * 
 * Takes a batch of mixed signals from different sources
 * and uses AI to:
 * 1. Generate context tags
 * 2. Discover relationships between signals
 * 
 * @param signals - Array of work signals to process
 * @param openaiClient - OpenAI client instance
 * @returns Processing result with enriched signals
 */
export async function processSignals(
  signals: WorkSignal[],
  openaiClient: OpenAI
): Promise<{
  enrichedSignals: WorkSignal[];
  result: ProcessingResult;
}> {
  const startTime = Date.now();
  const errors: string[] = [];

  if (!signals || signals.length === 0) {
    return {
      enrichedSignals: [],
      result: {
        success: true,
        signalsProcessed: 0,
        relationshipsCreated: 0,
        tagsGenerated: 0,
        processingTimeMs: Date.now() - startTime,
      },
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
Summary: ${signal.summary || 'N/A'}
Content: ${signal.content.substring(0, 500)}${signal.content.length > 500 ? '...' : ''}
---
`;
    }).join('\n');

    // Build system prompt
    const systemPrompt = `You are the Foldera Knowledge Graph. Connect the dots.

Look at these disparate items from different sources (Gmail, Slack, Linear, Notion). Link them together.

RULES:
1. If a Slack message mentions a bug, and a Linear ticket describes that bug, LINK THEM with type "RELATES_TO"
2. If an Email mentions a deadline, tag it 'Urgent'
3. Extract project names, priorities, and topics as context_tags
4. Identify dependencies (BLOCKS relationships) - if one item must complete before another
5. Find mentions (MENTIONS relationships) - when one item references another by name/ID
6. Be concise with tags (max 5 per signal)

OUTPUT FORMAT (JSON):
{
  "signals": [
    {
      "id": "signal_id_from_input",
      "context_tags": ["Project Phoenix", "Urgent", "Budget"],
      "relationships": [
        {
          "targetId": "other_signal_id",
          "type": "RELATES_TO",
          "reason": "Both mention the same deadline"
        }
      ]
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
          content: `Analyze these ${signals.length} work signals:\n\n${signalsText}`,
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

    // Enrich signals with AI-generated data
    const enrichedSignals: WorkSignal[] = signals.map((signal) => {
      const aiData = analysis.signals?.find((s: any) => s.id === signal.id);
      
      return {
        ...signal,
        context_tags: aiData?.context_tags || [],
        relationships: aiData?.relationships?.map((rel: any) => ({
          targetId: rel.targetId,
          type: rel.type,
          confidence: rel.confidence,
          reason: rel.reason,
        })) || [],
        processedAt: new Date(),
      };
    });

    // Calculate statistics
    const relationshipsCreated = enrichedSignals.reduce(
      (sum, signal) => sum + (signal.relationships?.length || 0),
      0
    );
    const tagsGenerated = enrichedSignals.reduce(
      (sum, signal) => sum + (signal.context_tags?.length || 0),
      0
    );

    const processingTimeMs = Date.now() - startTime;

    return {
      enrichedSignals,
      result: {
        success: true,
        signalsProcessed: signals.length,
        relationshipsCreated,
        tagsGenerated,
        errors: errors.length > 0 ? errors : undefined,
        processingTimeMs,
      },
    };

  } catch (error: any) {
    errors.push(error.message);
    console.error('[Processor] Error processing signals:', error);

    return {
      enrichedSignals: signals, // Return original signals on error
      result: {
        success: false,
        signalsProcessed: signals.length,
        relationshipsCreated: 0,
        tagsGenerated: 0,
        errors,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Process Signal Batch
 * 
 * Processes a batch of signals and returns enriched results
 * 
 * @param batch - Signal batch to process
 * @param openaiClient - OpenAI client instance
 * @returns Enriched batch with processing result
 */
export async function processBatch(
  batch: SignalBatch,
  openaiClient: OpenAI
): Promise<{
  enrichedBatch: SignalBatch;
  result: ProcessingResult;
}> {
  const { enrichedSignals, result } = await processSignals(
    batch.signals,
    openaiClient
  );

  return {
    enrichedBatch: {
      ...batch,
      signals: enrichedSignals,
      processedAt: new Date(),
    },
    result,
  };
}

/**
 * Normalize Signal
 * 
 * Converts a raw signal from any source into the WorkSignal format
 * Use this when ingesting from different sources
 * 
 * @param rawSignal - Raw signal data from source
 * @param source - Source system name
 * @returns Normalized WorkSignal
 */
export function normalizeSignal(
  rawSignal: {
    id: string;
    author: string;
    timestamp: Date | string;
    content: string;
    url?: string;
    summary?: string;
    status?: 'OPEN' | 'CLOSED' | 'WAITING';
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  },
  source: WorkSignalSource
): WorkSignal {
  return {
    id: `${source}:${rawSignal.id}`,
    source,
    author: rawSignal.author,
    timestamp: rawSignal.timestamp instanceof Date 
      ? rawSignal.timestamp 
      : new Date(rawSignal.timestamp),
    url: rawSignal.url || `https://${source}.com/${rawSignal.id}`, // Default URL if not provided
    content: rawSignal.content,
    summary: rawSignal.summary || '', // Will be filled by AI
    status: rawSignal.status || 'OPEN',
    priority: rawSignal.priority || 'MEDIUM',
  };
}

/**
 * Batch Signals
 * 
 * Groups signals into batches for efficient processing
 * 
 * @param signals - Signals to batch
 * @param batchSize - Maximum signals per batch (default: 10)
 * @returns Array of signal batches
 */
export function createBatches(
  signals: WorkSignal[],
  batchSize: number = 10
): SignalBatch[] {
  const batches: SignalBatch[] = [];
  
  for (let i = 0; i < signals.length; i += batchSize) {
    const batchSignals = signals.slice(i, i + batchSize);
    batches.push({
      signals: batchSignals,
      batchId: `batch_${Date.now()}_${i}`,
    });
  }
  
  return batches;
}

