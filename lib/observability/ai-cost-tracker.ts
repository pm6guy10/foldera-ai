import { logger } from './logger';

interface AIUsageRecord {
  userId: string;
  operation: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: Date;
}

// Cost per 1K tokens (as of 2024, update as needed)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-4o'];
  const inputCost = (promptTokens / 1000) * costs.input;
  const outputCost = (completionTokens / 1000) * costs.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 decimal places
}

export async function trackAIUsage(
  userId: string,
  operation: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
): Promise<void> {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || promptTokens + completionTokens;
  const estimatedCost = calculateCost(model, promptTokens, completionTokens);

  const record: AIUsageRecord = {
    userId,
    operation,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    timestamp: new Date(),
  };

  // Log for observability
  logger.info('AI usage tracked', {
    userId,
    operation,
    model,
    totalTokens,
    estimatedCost,
  });

  // Store in database
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from('ai_usage').insert({
      user_id: userId,
      operation,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      created_at: record.timestamp.toISOString(),
    });
  } catch (error) {
    // Don't fail the main operation if tracking fails
    logger.error('Failed to track AI usage', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

