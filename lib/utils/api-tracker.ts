/**
 * API Usage Tracker
 *
 * Logs every Claude API call to api_usage table.
 * Enforces daily spend cap of $1.50.
 *
 * Pricing (per 1M tokens, USD):
 *   claude-haiku-4-5-20251001   input: $0.80   output: $4.00
 *   claude-sonnet-4-20250514    input: $3.00   output: $15.00
 *   claude-sonnet-4-6           input: $3.00   output: $15.00
 *   claude-opus-4-6             input: $15.00  output: $75.00
 */

import { createServerClient } from '@/lib/db/client';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const DAILY_SPEND_CAP_USD = 1.50;

// Cost per token in USD
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001':  { input: 0.80  / 1_000_000, output: 4.00  / 1_000_000 },
  'claude-sonnet-4-20250514':   { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-sonnet-4-6':          { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-opus-4-6':            { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4-6'];
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

export interface TrackCallParams {
  userId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  callType: string;  // 'directive' | 'artifact' | 'agent' | 'extraction' | 'demo' | etc.
  persist?: boolean;
}

/**
 * Log a Claude API call to api_usage.
 * Fire-and-forget — never throws so callers don't need try/catch.
 */
export async function trackApiCall(params: TrackCallParams): Promise<void> {
  try {
    if (params.persist === false) {
      return;
    }
    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);
    const supabase = createServerClient();
    const { error } = await supabase.from('api_usage').insert({
      user_id:       params.userId ?? null,
      model:         params.model,
      input_tokens:  params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: cost,
      call_type:     params.callType,
    });
    if (error) {
      throw error;
    }
  } catch (error) {
    logStructuredEvent({
      event: 'api_usage_tracking_failed',
      level: 'warn',
      userId: params.userId ?? null,
      artifactType: null,
      generationStatus: 'tracking_failed',
      details: {
        scope: 'api-tracker',
        call_type: params.callType,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Get total spend today (UTC day) in USD.
 * Returns 0 on error.
 */
export async function getDailySpend(userId: string): Promise<number> {
  const supabase = createServerClient();
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .eq('user_id', userId)
    .gte('created_at', todayUTC.toISOString());

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((sum: number, row: { estimated_cost: string | number }) => {
    return sum + Number(row.estimated_cost);
  }, 0);
}

/**
 * Returns true if daily spend cap has been reached.
 * Logs a warning when cap is hit.
 */
export async function isOverDailyLimit(userId: string): Promise<boolean> {
  const spend = await getDailySpend(userId);
  if (spend >= DAILY_SPEND_CAP_USD) {
    logStructuredEvent({
      event: 'daily_spend_cap_reached',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'daily_cap_reached',
      details: {
        scope: 'api-tracker',
        spend_usd: Number(spend.toFixed(4)),
        daily_cap_usd: DAILY_SPEND_CAP_USD,
      },
    });
    return true;
  }
  return false;
}

/**
 * Get spend summary for display on settings page.
 */
export async function getSpendSummary(userId: string): Promise<{
  todayUSD: number;
  monthUSD: number;
  dailyCapUSD: number;
  capPct: number;
}> {
  const supabase = createServerClient();
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), 1));

  const [todayRes, monthRes] = await Promise.all([
    supabase
      .from('api_usage')
      .select('estimated_cost')
      .eq('user_id', userId)
      .gte('created_at', todayUTC.toISOString()),
    supabase
      .from('api_usage')
      .select('estimated_cost')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString()),
  ]);

  if (todayRes.error) {
    throw todayRes.error;
  }

  if (monthRes.error) {
    throw monthRes.error;
  }

  const todayUSD  = (todayRes.data  ?? []).reduce((s: number, r: { estimated_cost: string | number }) => s + Number(r.estimated_cost), 0);
  const monthUSD  = (monthRes.data  ?? []).reduce((s: number, r: { estimated_cost: string | number }) => s + Number(r.estimated_cost), 0);

  return {
    todayUSD,
    monthUSD,
    dailyCapUSD: DAILY_SPEND_CAP_USD,
    capPct: Math.min(100, Math.round((todayUSD / DAILY_SPEND_CAP_USD) * 100)),
  };
}
