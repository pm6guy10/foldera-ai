/**
 * Postgres-enforced Anthropic monthly budget (api_budget_check_and_reserve + api_budget_status).
 * TypeScript only calls the RPC — caps live in the database.
 */

import { createServerClient } from '@/lib/db/client';

/** Matches typical `api_budget_check_and_reserve` test / default increment. */
export const ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS = 10;

export type BudgetReserveResult = {
  allowed: boolean;
  raw: unknown;
  errorMessage?: string;
};

/** Normalize Supabase RPC return (single row object or one-element array). */
export function parseBudgetRpcData(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (typeof data === 'object') return data as Record<string, unknown>;
  return null;
}

/**
 * Fail closed: RPC error, missing data, or allowed !== true → not allowed.
 */
export function isBudgetRpcAllowed(data: unknown): boolean {
  const row = parseBudgetRpcData(data);
  if (!row) return false;
  return row.allowed === true;
}

/**
 * Reserve slot for the next generation bundle (one call per generateDirective, before any Anthropic usage).
 */
export async function reserveAnthropicBudgetSlot(
  estimatedCents: number = ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS,
): Promise<BudgetReserveResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await (
      supabase as unknown as {
        rpc: (n: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc('api_budget_check_and_reserve', {
      estimated_cents: estimatedCents,
    });
    if (error) {
      return { allowed: false, raw: null, errorMessage: error.message };
    }
    const allowed = isBudgetRpcAllowed(data);
    return { allowed, raw: parseBudgetRpcData(data) ?? data };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { allowed: false, raw: null, errorMessage };
  }
}

/**
 * Snapshot current budget view into system_health for cron observability (fire-and-forget safe).
 */
export async function logApiBudgetStatusToSystemHealth(runType: string): Promise<void> {
  try {
    const supabase = createServerClient();
    const { data, error } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (q: string) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      }
    )
      .from('api_budget_status')
      .select('*');
    if (error) {
      await supabase.from('system_health').insert({
        user_id: null,
        run_type: runType,
        failure_class: 'api_budget_status_error',
        failure_detail: error.message.slice(0, 2000),
        raw_receipt: { error: error.message },
      });
      return;
    }
    await supabase.from('system_health').insert({
      user_id: null,
      run_type: runType,
      sync_healthy: true,
      processing_healthy: true,
      generation_healthy: true,
      delivery_healthy: true,
      failure_class: 'api_budget_snapshot',
      failure_detail: null,
      raw_receipt: { api_budget_status: data },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const supabase = createServerClient();
      await supabase.from('system_health').insert({
        user_id: null,
        run_type: runType,
        failure_class: 'api_budget_telemetry_failed',
        failure_detail: msg.slice(0, 2000),
        raw_receipt: { error: msg },
      });
    } catch {
      /* swallow */
    }
  }
}
