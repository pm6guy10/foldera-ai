// =====================================================
// AI COST TRACKING
// Tracks OpenAI API usage and costs per user
// =====================================================

import { logger } from './logger';
import { createClient } from '@supabase/supabase-js';

interface AIUsage {
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  operation: string; // e.g., 'conflict-detection', 'draft-generation'
  promptVersion?: string;
}

// Model pricing (as of 2024, update as needed)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 }, // $2.50/$10 per 1M tokens
  'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 }, // $0.15/$0.60 per 1M tokens
  'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
  'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 },
};

/**
 * Calculate cost for AI usage
 */
function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    logger.warn('Unknown model pricing', { model });
    return 0;
  }
  
  const inputCost = promptTokens * pricing.input;
  const outputCost = completionTokens * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Log AI usage to database and logger
 */
export async function logAIUsage(usage: AIUsage): Promise<void> {
  try {
    const totalTokens = usage.promptTokens + usage.completionTokens;
    const cost = calculateCost(usage.model, usage.promptTokens, usage.completionTokens);
    
    // Log to structured logger
    logger.info('AI usage', {
      userId: usage.userId,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      cost,
      operation: usage.operation,
      promptVersion: usage.promptVersion,
    });
    
    // Store in database (if table exists)
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Try to insert into ai_usage table (create migration if doesn't exist)
      await supabase.from('ai_usage').insert({
        user_id: usage.userId,
        model: usage.model,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: totalTokens,
        cost,
        operation: usage.operation,
        prompt_version: usage.promptVersion,
        created_at: new Date().toISOString(),
      });
    } catch (dbError: any) {
      // Table might not exist yet - log but don't fail
      logger.debug('AI usage table not found, skipping database log', {
        error: dbError.message,
      });
    }
  } catch (error: any) {
    // Don't fail the main operation if logging fails
    logger.error('Failed to log AI usage', error, {
      userId: usage.userId,
      operation: usage.operation,
    });
  }
}

/**
 * Track OpenAI API response usage
 */
export function trackOpenAIUsage(
  userId: string,
  model: string,
  response: any,
  operation: string,
  promptVersion?: string
): void {
  const usage = response.usage;
  if (!usage) {
    logger.warn('OpenAI response missing usage data', { model, operation });
    return;
  }
  
  logAIUsage({
    userId,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cost: 0, // Will be calculated
    operation,
    promptVersion,
  });
}

