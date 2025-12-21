import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Pricing per 1M tokens (as of Dec 2024)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface UsageRecord {
  user_id: string;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

/**
 * Calculates cost for token usage
 */
export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

/**
 * Tracks AI usage for cost monitoring and budgeting
 */
export async function trackAIUsage(
  userId: string,
  operation: string,
  model: string,
  usage: TokenUsage
): Promise<void> {
  const cost = calculateCost(model, usage);
  
  const record: UsageRecord = {
    user_id: userId,
    operation,
    model,
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    cost_usd: cost,
    created_at: new Date().toISOString(),
  };
  
  // Log immediately (don't block on DB)
  console.log(`[AI COST] ${operation} | ${model} | ${usage.prompt_tokens}/${usage.completion_tokens} tokens | $${cost.toFixed(6)}`);
  
  // Fire-and-forget DB insert
  supabase
    .from('ai_usage')
    .insert(record)
    .then(({ error }) => {
      if (error) {
        console.error('[AI COST] Failed to persist usage:', error.message);
      }
    });
}

/**
 * Gets usage summary for a user
 */
export async function getUserUsageSummary(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  operationBreakdown: Record<string, number>;
}> {
  let query = supabase
    .from('ai_usage')
    .select('*')
    .eq('user_id', userId);
  
  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    query = query.lte('created_at', endDate.toISOString());
  }
  
  const { data, error } = await query;
  
  if (error || !data) {
    return {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      operationBreakdown: {},
    };
  }
  
  const operationBreakdown: Record<string, number> = {};
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  for (const record of data) {
    totalCost += record.cost_usd;
    totalInputTokens += record.input_tokens;
    totalOutputTokens += record.output_tokens;
    operationBreakdown[record.operation] = (operationBreakdown[record.operation] || 0) + record.cost_usd;
  }
  
  return { totalCost, totalInputTokens, totalOutputTokens, operationBreakdown };
}

/**
 * Checks if user is within budget
 */
export async function checkBudget(
  userId: string,
  monthlyBudgetUsd: number = 10
): Promise<{ withinBudget: boolean; used: number; remaining: number }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const summary = await getUserUsageSummary(userId, startOfMonth);
  
  return {
    withinBudget: summary.totalCost <= monthlyBudgetUsd,
    used: summary.totalCost,
    remaining: Math.max(0, monthlyBudgetUsd - summary.totalCost),
  };
}

