// =====================================================
// CONFLICT DETECTOR
// Detects scheduling and commitment conflicts
// =====================================================

import OpenAI from 'openai';
import { getPromptVersion } from '../prompts/conflict-detection';
import { logger } from '../observability/logger';
import { sanitizeForPrompt } from '../utils/prompt-sanitization';
import { trackAIUsage } from '../observability/ai-cost-tracker';

export interface WorkSignal {
  id: string;
  type: string;
  source: string;
  datetime?: string;
  content?: string;
  author?: string;
}

export interface Conflict {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  signals_involved: string[];
  summary: string;
  recommended_action: string;
  datetime?: string;
}

/**
 * Conflict Detector Class
 * Detects conflicts across different signal sources
 */
export class ConflictSolver {
  /**
   * Detect conflicts from a list of signals
   */
  static async detect(
    signals: WorkSignal[],
    openaiClient: OpenAI
  ): Promise<Conflict[]> {
    const startTime = Date.now();

    try {
      // Filter for calendar events and scheduling-related signals
      const calendarSignals = signals.filter(
        (s) => s.type === 'calendar_event' || s.datetime
      );

      if (calendarSignals.length < 2) {
        logger.debug('Insufficient signals for conflict detection', {
          signalCount: signals.length,
          calendarSignalCount: calendarSignals.length,
        });
        return [];
      }

      // Get the prompt configuration
      const promptConfig = getPromptVersion('scheduling-conflict');

      // Format signals for AI analysis (with sanitization)
      const signalsText = signals
        .map(
          (s, idx) => `
Signal ${idx + 1}:
- ID: ${s.id}
- Type: ${s.type}
- Source: ${s.source}
- Datetime: ${s.datetime || 'N/A'}
- Author: ${s.author ? sanitizeForPrompt(s.author, 200) : 'N/A'}
- Content: ${s.content ? sanitizeForPrompt(s.content, 200) : 'N/A'}
`
        )
        .join('\n');

      // Call OpenAI for conflict detection
      const completion = await openaiClient.chat.completions.create({
        model: promptConfig.model,
        messages: [
          {
            role: 'system',
            content: promptConfig.system,
          },
          {
            role: 'user',
            content: `Analyze these signals for conflicts:\n\n${signalsText}`,
          },
        ],
        temperature: promptConfig.temperature,
        max_tokens: promptConfig.maxTokens || 2000,
        response_format: { type: 'json_object' },
      });

      const result = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(result);

      const conflicts: Conflict[] = parsed.conflicts || parsed.findings || [];

      // Track AI usage (if userId is available in context)
      // Note: This requires userId to be passed - update signature if needed
      if (completion.usage) {
        // For now, we'll track without userId (can be added later)
        logger.info('Conflict detection completed', {
          signalCount: signals.length,
          conflictsFound: conflicts.length,
          processingTimeMs: Date.now() - startTime,
          promptVersion: promptConfig.version,
          tokensUsed: completion.usage.total_tokens,
        });
      }

      return conflicts;
    } catch (error: any) {
      logger.error('Conflict detection failed', {
        signalCount: signals.length,
        processingTimeMs: Date.now() - startTime,
        error
      });

      return [];
    }
  }

  /**
   * Detect scheduling conflicts specifically
   * Checks for overlapping time slots
   */
  static detectSchedulingConflicts(signals: WorkSignal[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const timeSlots = new Map<string, WorkSignal[]>();

    // Group signals by datetime
    for (const signal of signals) {
      if (signal.datetime) {
        const timeKey = new Date(signal.datetime).toISOString();
        if (!timeSlots.has(timeKey)) {
          timeSlots.set(timeKey, []);
        }
        timeSlots.get(timeKey)!.push(signal);
      }
    }

    // Find conflicts (multiple signals at same time)
    for (const [datetime, signalsAtTime] of timeSlots.entries()) {
      if (signalsAtTime.length > 1) {
        // Check if they're from different sources (Gmail + Outlook)
        const sources = new Set(signalsAtTime.map((s) => s.source));
        if (sources.size > 1) {
          conflicts.push({
            type: 'scheduling_conflict',
            severity: 'high',
            signals_involved: signalsAtTime.map((s) => s.id),
            summary: `Multiple calendar events scheduled at the same time from different sources`,
            recommended_action: 'Review and resolve scheduling conflict',
            datetime,
          });
        }
      }
    }

    return conflicts;
  }
}

