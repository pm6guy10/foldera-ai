/**
 * API Usage Tracker
 *
 * Logs every Claude API call to api_usage table.
 * Enforces daily spend cap of $1.00, except extraction traffic which uses
 * its own higher daily cap to allow backlog backfills.
 *
 * Pricing (per 1M tokens, USD):
 *   Haiku 4.5                   input: $0.80   output: $4.00
 *   Sonnet 4 / 4.6              input: $3.00   output: $15.00
 *   Opus 4.6                    input: $15.00  output: $75.00
 */

import { createServerClient } from '@/lib/db/client';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const DAILY_SPEND_CAP_USD = 1.00;
export const EXTRACTION_DAILY_CAP = 2.00;
// Max directive-generation LLM calls per UTC day for manual/interactive runs.
// Applies only when skipSpendCap=true (Generate Now, smoke tests).
// Cron runs are bounded by DAILY_SPEND_CAP_USD instead.
const MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY = 30;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = ['claude', 'sonnet-4-20250514'].join('-');
const SONNET_46_MODEL = ['claude', 'sonnet-4-6'].join('-');
const OPUS_46_MODEL = ['claude', 'opus-4-6'].join('-');

// Cost per token in USD
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  [HAIKU_MODEL]:      { input: 0.80  / 1_000_000, output: 4.00  / 1_000_000 },
  [SONNET_MODEL]:     { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
  [SONNET_46_MODEL]:  { input: 3.00  / 1_000_000, output: 15.00 / 1_000_000 },
  [OPUS_46_MODEL]:    { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[SONNET_46_MODEL];
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

export interface TrackCallParams {
  userId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  callType: string;  // logical endpoint/call site: 'directive' | 'artifact' | 'agent' | etc.
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
      endpoint:      params.callType,
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
 *
 * Day boundary is UTC midnight (not PT).
 * Cron fires at 11:00 UTC (4am PT).
 * Spend cap resets at midnight UTC = 4pm PT the previous day.
 * A ~19hr spend window relative to cron fire time.
 */
export async function getDailySpend(userId: string): Promise<number> {
  const supabase = createServerClient();
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  // Exclude extraction traffic — it has its own separate cap
  const { data, error } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .eq('user_id', userId)
    .not('endpoint', 'in', '("extraction","signal_extraction")')
    .gte('created_at', todayUTC.toISOString());

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((sum: number, row: { estimated_cost: string | number }) => {
    return sum + Number(row.estimated_cost);
  }, 0);
}

async function getDailySpendByEndpoints(userId: string, endpoints: string[]): Promise<number> {
  const supabase = createServerClient();
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('api_usage')
    .select('estimated_cost')
    .eq('user_id', userId)
    .in('endpoint', endpoints)
    .gte('created_at', todayUTC.toISOString());

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((sum: number, row: { estimated_cost: string | number }) => {
    return sum + Number(row.estimated_cost);
  }, 0);
}

function isExtractionCall(callType?: string): boolean {
  return callType === 'extraction' || callType === 'signal_extraction';
}

/**
 * Returns true if daily spend cap has been reached.
 * Logs a warning when cap is hit.
 */
export async function isOverDailyLimit(userId: string, callType?: string): Promise<boolean> {
  const extractionCall = isExtractionCall(callType);
  const spend = extractionCall
    ? await getDailySpendByEndpoints(userId, ['extraction', 'signal_extraction'])
    : await getDailySpend(userId);
  const cap = extractionCall ? EXTRACTION_DAILY_CAP : DAILY_SPEND_CAP_USD;

  if (spend >= cap) {
    logStructuredEvent({
      event: extractionCall ? 'extraction_daily_spend_cap_reached' : 'daily_spend_cap_reached',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: extractionCall ? 'extraction_daily_cap_reached' : 'daily_cap_reached',
      details: {
        scope: 'api-tracker',
        spend_usd: Number(spend.toFixed(4)),
        daily_cap_usd: cap,
        call_type: callType ?? null,
      },
    });
    return true;
  }
  return false;
}

/**
 * Returns true if the user has exceeded the per-day manual directive call cap.
 * This guard applies to interactive/test runs that bypass the spend cap
 * (skipSpendCap=true). It prevents smoke-test suites from burning $2.50/day
 * on repeated Generate Now calls.
 *
 * Counts directive + directive_retry api_usage rows since UTC midnight.
 * Fails open (returns false) on DB error so legitimate users are never hard-blocked.
 */
export async function isOverManualCallLimit(userId: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('api_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('endpoint', ['directive', 'directive_retry'])
      .gte('created_at', todayUTC.toISOString());

    if (error) return false;

    const callCount = count ?? 0;
    if (callCount >= MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY) {
      logStructuredEvent({
        event: 'manual_directive_call_limit_reached',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'manual_call_limit_reached',
        details: {
          scope: 'api-tracker',
          call_count: callCount,
          max_calls: MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY,
        },
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get spend summary for display on settings page.
 */
export async function getSpendSummary(userId: string): Promise<{
  todayUSD: number;
  monthUSD: number;
  dailyCapUSD: number;
  extractionDailyCapUSD: number;
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
    extractionDailyCapUSD: EXTRACTION_DAILY_CAP,
    capPct: Math.min(100, Math.round((todayUSD / DAILY_SPEND_CAP_USD) * 100)),
  };
}
