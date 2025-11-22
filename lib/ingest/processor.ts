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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
Timestamp: ${signal.timestamp}
Content: ${signal.content.substring(0, 1000)}${signal.content.length > 1000 ? '...' : ''}
---
`;
    }).join('\n');

    // Build system prompt
    const systemPrompt = `You are a Chief of Staff. Analyze these signals. Identify conflicts (especially Slack vs Calendar).

CRITICAL: Look for CONTRADICTIONS and CONFLICTS:
- If a Slack message says a meeting is moved to Tuesday, but Calendar shows Monday → CONTRADICTION
- If an email promises a deadline, but another signal says it's delayed → CONTRADICTION
- If signals mention the same event but with different dates/times → CONTRADICTION

RULES:
1. Focus on CONFLICTS first, especially between Slack messages and Calendar events
2. Extract project names, priorities, and topics as context_tags
3. Identify dependencies (blocks relationships) - if one item must complete before another
4. Find related items (relates_to relationships) - when signals are about the same topic
5. Be concise with tags (max 5 per signal)

OUTPUT FORMAT (JSON only, no markdown):
{
  "signals": [
    {
      "id": "signal_id_from_input",
      "context_tags": ["Project Phoenix", "Urgent", "Budget"],
      "relationships": [
        {
          "targetId": "other_signal_id",
          "type": "contradicts",
          "reason": "Slack message says meeting moved to Tuesday, but Calendar shows Monday"
        }
      ]
    }
  ]
}`;

    // Call OpenAI
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
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
      temperature: 0.3, // Lower temperature for more factual conflict detection
      max_tokens: 2000,
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
          reason: rel.reason || 'No reason provided',
        })) || [],
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
  // Convert timestamp to ISO string format
  const timestamp = rawSignal.timestamp instanceof Date 
    ? rawSignal.timestamp.toISOString()
    : typeof rawSignal.timestamp === 'string'
    ? rawSignal.timestamp
    : new Date(rawSignal.timestamp).toISOString();

  return {
    id: `${source}:${rawSignal.id}`,
    source,
    author: rawSignal.author,
    timestamp,
    content: rawSignal.content,
    context_tags: [], // Will be filled by AI during processing
    relationships: [], // Will be filled by AI during processing
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

/**
 * Save Signals to Database
 * 
 * Phase 3.1: The Cortex (Persistence Layer)
 * 
 * Persists WorkSignal nodes and SignalRelationship edges to Supabase.
 * This gives the AI "memory" - insights are stored in the Knowledge Graph.
 * 
 * @param signals - Enriched work signals to persist
 * @param userId - User ID to associate signals with
 * @param supabaseClient - Supabase client instance (with service role key)
 * @returns Success status and counts
 */
export async function saveSignalsToDb(
  signals: WorkSignal[],
  userId: string,
  supabaseClient: SupabaseClient
): Promise<{
  success: boolean;
  signalsSaved: number;
  relationshipsSaved: number;
  errors?: string[];
}> {
  const errors: string[] = [];
  let signalsSaved = 0;
  let relationshipsSaved = 0;

  if (!signals || signals.length === 0) {
    return {
      success: true,
      signalsSaved: 0,
      relationshipsSaved: 0,
    };
  }

  try {
    // STEP 1: Upsert Signals (Nodes)
    console.log(`[Cortex] Saving ${signals.length} signal(s) to database...`);

    const signalInserts = signals.map((signal) => {
      // Extract source-specific metadata
      const rawMetadata: any = {
        originalId: signal.id,
        timestamp: signal.timestamp,
      };

      // Determine raw metadata based on source
      if (signal.id.includes(':')) {
        const [source, id] = signal.id.split(':');
        rawMetadata.sourceId = id;
      }

      return {
        user_id: userId,
        signal_id: signal.id, // Original signal ID (e.g., "calendar:phoenix-kickoff-2024-01-15")
        source: signal.source,
        author: signal.author,
        content: signal.content,
        context_tags: signal.context_tags || [],
        raw_metadata: rawMetadata,
      };
    });

    // Upsert signals (insert or update if exists)
    const { data: savedSignals, error: signalsError } = await supabaseClient
      .from('work_signals')
      .upsert(signalInserts, {
        onConflict: 'user_id,signal_id',
        ignoreDuplicates: false,
      })
      .select('id, signal_id');

    if (signalsError) {
      throw new Error(`Failed to save signals: ${signalsError.message}`);
    }

    signalsSaved = savedSignals?.length || 0;
    console.log(`✅ Saved ${signalsSaved} signal(s) to database`);

    // Create a mapping of signal_id -> database id for relationships
    const signalIdToDbId = new Map<string, string>();
    if (savedSignals) {
      for (const savedSignal of savedSignals) {
        signalIdToDbId.set(savedSignal.signal_id, savedSignal.id);
      }
    }

    // STEP 2: Insert Relationships (Edges)
    console.log(`[Cortex] Saving relationships to database...`);

    const relationshipInserts: Array<{
      source_signal_id: string;
      target_signal_id: string;
      relationship_type: string;
      reason: string;
    }> = [];

    for (const signal of signals) {
      const sourceDbId = signalIdToDbId.get(signal.id);
      
      if (!sourceDbId) {
        console.warn(`[Cortex] Warning: Could not find DB ID for signal ${signal.id}`);
        continue;
      }

      if (!signal.relationships || signal.relationships.length === 0) {
        continue;
      }

      for (const relationship of signal.relationships) {
        const targetDbId = signalIdToDbId.get(relationship.targetId);

        if (!targetDbId) {
          console.warn(`[Cortex] Warning: Could not find DB ID for target signal ${relationship.targetId}`);
          continue;
        }

        // Avoid self-references
        if (sourceDbId === targetDbId) {
          continue;
        }

        relationshipInserts.push({
          source_signal_id: sourceDbId,
          target_signal_id: targetDbId,
          relationship_type: relationship.type,
          reason: relationship.reason || 'No reason provided',
        });
      }
    }

    if (relationshipInserts.length > 0) {
      // Remove duplicates (same source, target, type)
      const uniqueRelationships = relationshipInserts.filter((rel, index, self) =>
        index === self.findIndex((r) =>
          r.source_signal_id === rel.source_signal_id &&
          r.target_signal_id === rel.target_signal_id &&
          r.relationship_type === rel.relationship_type
        )
      );

      const { error: relationshipsError } = await supabaseClient
        .from('signal_relationships')
        .upsert(uniqueRelationships, {
          onConflict: 'source_signal_id,target_signal_id,relationship_type',
          ignoreDuplicates: true,
        });

      if (relationshipsError) {
        errors.push(`Failed to save relationships: ${relationshipsError.message}`);
        console.error(`❌ Error saving relationships:`, relationshipsError);
      } else {
        relationshipsSaved = uniqueRelationships.length;
        console.log(`✅ Saved ${relationshipsSaved} relationship(s) to database`);
      }
    } else {
      console.log(`ℹ️  No relationships to save`);
    }

    return {
      success: errors.length === 0,
      signalsSaved,
      relationshipsSaved,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error: any) {
    console.error('[Cortex] Error saving signals to database:', error);
    errors.push(error.message);

    return {
      success: false,
      signalsSaved,
      relationshipsSaved,
      errors,
    };
  }
}

