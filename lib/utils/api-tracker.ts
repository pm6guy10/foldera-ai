/**
 * API Usage Tracker
 *
 * Logs every Claude API call to api_usage table.
 * Enforces a daily spend cap on non-extraction traffic; extraction (`extraction`,
 * `signal_extraction` endpoints) uses a separate daily cap (`EXTRACTION_DAILY_CAP`,
 * from `EXTRACTION_DAILY_CAP_USD` or a conservative default).
 *
 * Pricing (per 1M tokens, USD):
 *   Haiku 4.5                   input: $0.80   output: $4.00
 *   Sonnet 4 / 4.6              input: $3.00   output: $15.00
 *   Opus 4.6                    input: $15.00  output: $75.00
 */

import { createServerClient } from '@/lib/db/client';
import { getPipelineRunContext } from '@/lib/observability/pipeline-run-context';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const DAILY_SPEND_CAP_USD = 1.00;
/** USD/day UTC for `extraction` + `signal_extraction`. Env override for backlog catch-up; unset uses default. */
function resolveExtractionDailyCapUsd(): number {
  const raw = process.env.EXTRACTION_DAILY_CAP_USD?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  // Reverted 2026-06-19 (Pass 3, #445) to the documented 0.25 intent after the 2026-04-09
  // backlog-drain raise was never reverted — it left a 16x latent worst-case landmine ($4 vs $0.25).
  // The env override (EXTRACTION_DAILY_CAP_USD) remains for deliberate backlog catch-up.
  return 0.25;
}
export const EXTRACTION_DAILY_CAP = resolveExtractionDailyCapUsd();
// Max directive-generation LLM calls per UTC day for manual/interactive runs.
// Applies only when skipSpendCap=true (Generate Now, smoke tests).
// Cron runs are bounded by DAILY_SPEND_CAP_USD instead.
const MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY = 3;
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

type CostEventRow = {
  created_at: string;
  endpoint: string;
  model: string;
  estimated_cost: string | number;
  input_tokens: number;
  output_tokens: number;
};

export type CostWindowSummary = {
  total_usd: number;
  event_count: number;
  input_tokens: number;
  output_tokens: number;
};

type CostBreakdownRow = {
  total_usd: number;
  event_count: number;
};

export type CostEventSummaryReport = {
  generated_at: string;
  windows: {
    last_24h: CostWindowSummary;
    last_7d: CostWindowSummary;
    last_30d: CostWindowSummary;
  };
  by_endpoint_7d: Array<{ endpoint: string } & CostBreakdownRow>;
  by_model_7d: Array<{ model: string } & CostBreakdownRow>;
};

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
    const prCtx = getPipelineRunContext();
    const sharedPayload = {
      user_id:       params.userId ?? null,
      model:         params.model,
      input_tokens:  params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: cost,
      endpoint:      params.callType,
      ...(prCtx?.pipelineRunId ? { pipeline_run_id: prCtx.pipelineRunId } : {}),
    };
    const [
      apiUsageResult,
      costEventsResult,
    ] = await Promise.all([
      supabase.from('api_usage').insert(sharedPayload),
      supabase.from('cost_events').insert({
        ...sharedPayload,
        provider: 'anthropic',
      }),
    ]);
    if (apiUsageResult.error) {
      throw apiUsageResult.error;
    }
    if (costEventsResult.error) {
      throw costEventsResult.error;
    }
  } catch (error) {
    logStructuredEvent({
      event: 'llm_cost_tracking_failed',
      level: 'warn',
      userId: params.userId ?? null,
      artifactType: null,
      generationStatus: 'tracking_failed',
      details: {
        scope: 'api-tracker',
        tables: ['api_usage', 'cost_events'],
        call_type: params.callType,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function emptyCostWindowSummary(): CostWindowSummary {
  return {
    total_usd: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
  };
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function addToWindow(summary: CostWindowSummary, row: CostEventRow): void {
  summary.total_usd = roundUsd(summary.total_usd + Number(row.estimated_cost ?? 0));
  summary.event_count += 1;
  summary.input_tokens += Number(row.input_tokens ?? 0);
  summary.output_tokens += Number(row.output_tokens ?? 0);
}

function addToBreakdown<T extends string>(
  map: Map<T, CostBreakdownRow>,
  key: T,
  row: CostEventRow,
): void {
  const current = map.get(key) ?? { total_usd: 0, event_count: 0 };
  current.total_usd = roundUsd(current.total_usd + Number(row.estimated_cost ?? 0));
  current.event_count += 1;
  map.set(key, current);
}

function breakdownToArray<T extends string, K extends string>(
  map: Map<T, CostBreakdownRow>,
  field: K,
): Array<Record<K, T> & CostBreakdownRow> {
  return Array.from(map.entries())
    .map(([key, value]) => ({
      [field]: key,
      ...value,
    }) as Record<K, T> & CostBreakdownRow)
    .sort((a, b) => b.total_usd - a.total_usd || b.event_count - a.event_count);
}

export async function getCostEventSummaryReport(): Promise<CostEventSummaryReport> {
  const supabase = createServerClient();
  const now = new Date();
  const since30d = new Date(now);
  since30d.setUTCDate(since30d.getUTCDate() - 30);

  const { data, error } = await supabase
    .from('cost_events')
    .select('created_at, endpoint, model, estimated_cost, input_tokens, output_tokens')
    .gte('created_at', since30d.toISOString());

  if (error) {
    throw error;
  }

  const summary: CostEventSummaryReport = {
    generated_at: now.toISOString(),
    windows: {
      last_24h: emptyCostWindowSummary(),
      last_7d: emptyCostWindowSummary(),
      last_30d: emptyCostWindowSummary(),
    },
    by_endpoint_7d: [],
    by_model_7d: [],
  };

  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDayMs = 7 * oneDayMs;
  const thirtyDayMs = 30 * oneDayMs;
  const endpoint7d = new Map<string, CostBreakdownRow>();
  const model7d = new Map<string, CostBreakdownRow>();

  for (const row of (data ?? []) as CostEventRow[]) {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    const ageMs = now.getTime() - createdAtMs;
    if (ageMs <= oneDayMs) {
      addToWindow(summary.windows.last_24h, row);
    }
    if (ageMs <= sevenDayMs) {
      addToWindow(summary.windows.last_7d, row);
      addToBreakdown(endpoint7d, row.endpoint, row);
      addToBreakdown(model7d, row.model, row);
    }
    if (ageMs <= thirtyDayMs) {
      addToWindow(summary.windows.last_30d, row);
    }
  }

  summary.by_endpoint_7d = breakdownToArray(endpoint7d, 'endpoint');
  summary.by_model_7d = breakdownToArray(model7d, 'model');

  return summary;
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

/**
 * Sum estimated_cost for api_usage rows since UTC midnight where endpoint matches.
 * Used for per-agent cron spend caps (user_id may be null).
 */
export async function getGlobalEndpointSpendToday(endpoint: string): Promise<number> {
  try {
    const supabase = createServerClient();
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('api_usage')
      .select('estimated_cost')
      .eq('endpoint', endpoint)
      .gte('created_at', todayUTC.toISOString());

    if (error) {
      throw error;
    }

    return (data ?? []).reduce((sum: number, row: { estimated_cost: string | number }) => {
      return sum + Number(row.estimated_cost);
    }, 0);
  } catch (error) {
    logStructuredEvent({
      event: 'agent_spend_query_failed',
      level: 'warn',
      userId: null,
      artifactType: null,
      generationStatus: 'spend_query_failed',
      details: {
        scope: 'api-tracker',
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return 0;
  }
}
