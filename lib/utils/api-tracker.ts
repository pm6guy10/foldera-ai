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
}

/**
 * Log a Claude API call to api_usage.
 * Fire-and-forget — never throws so callers don't need try/catch.
 */
export async function trackApiCall(params: TrackCallParams): Promise<void> {
  try {
    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);
    const supabase = createServerClient();
    await supabase.from('api_usage').insert({
      user_id:       params.userId ?? null,
      model:         params.model,
      input_tokens:  params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: cost,
      call_type:     params.callType,
    });
  } catch {
    // Silent — never break calling code over tracking
  }
}

/**
 * Get total spend today (UTC day) in USD.
 * Returns 0 on error.
 */
export async function getDailySpend(): Promise<number> {
  try {
    const supabase = createServerClient();
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('api_usage')
      .select('estimated_cost')
      .gte('created_at', todayUTC.toISOString());

    if (error || !data) return 0;
    return data.reduce((sum: number, row: { estimated_cost: string | number }) => {
      return sum + Number(row.estimated_cost);
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * Returns true if daily spend cap has been reached.
 * Logs a warning when cap is hit.
 */
export async function isOverDailyLimit(): Promise<boolean> {
  const spend = await getDailySpend();
  if (spend >= DAILY_SPEND_CAP_USD) {
    console.warn(`[api-tracker] Daily spend cap reached: $${spend.toFixed(4)} >= $${DAILY_SPEND_CAP_USD}`);
    return true;
  }
  return false;
}

/**
 * Get spend summary for display on settings page.
 */
export async function getSpendSummary(): Promise<{
  todayUSD: number;
  monthUSD: number;
  dailyCapUSD: number;
  capPct: number;
}> {
  try {
    const supabase = createServerClient();
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(todayUTC.getFullYear(), todayUTC.getMonth(), 1);

    const [todayRes, monthRes] = await Promise.all([
      supabase.from('api_usage').select('estimated_cost').gte('created_at', todayUTC.toISOString()),
      supabase.from('api_usage').select('estimated_cost').gte('created_at', monthStart.toISOString()),
    ]);

    const todayUSD  = (todayRes.data  ?? []).reduce((s: number, r: { estimated_cost: string | number }) => s + Number(r.estimated_cost), 0);
    const monthUSD  = (monthRes.data  ?? []).reduce((s: number, r: { estimated_cost: string | number }) => s + Number(r.estimated_cost), 0);

    return {
      todayUSD,
      monthUSD,
      dailyCapUSD: DAILY_SPEND_CAP_USD,
      capPct: Math.min(100, Math.round((todayUSD / DAILY_SPEND_CAP_USD) * 100)),
    };
  } catch {
    return { todayUSD: 0, monthUSD: 0, dailyCapUSD: DAILY_SPEND_CAP_USD, capPct: 0 };
  }
}
