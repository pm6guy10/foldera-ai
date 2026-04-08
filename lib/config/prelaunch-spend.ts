/**
 * Pre-launch LLM spend policy: production defaults and env gates.
 * See CLAUDE.md "Pre-launch pipeline spend" for operator setup.
 */

export function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** When true on Vercel production, settings run-brief defaults to pipeline dry-run unless paid LLM is explicitly allowed. */
export function isProdDefaultPipelineDryRunEnabled(): boolean {
  return isVercelProduction() && process.env.PROD_DEFAULT_PIPELINE_DRY_RUN === 'true';
}

/** Required on production (with default dry-run) for `use_llm=true` to run real Anthropic on the directive path. */
export function isAllowProdPaidLlmEnabled(): boolean {
  return process.env.ALLOW_PROD_PAID_LLM === 'true';
}

/** Cron daily-brief: force `pipelineDryRun` for scheduled runs (no directive-path Anthropic). */
export function isCronDailyBriefPipelineDryRunEnabled(): boolean {
  return process.env.CRON_DAILY_BRIEF_PIPELINE_DRY_RUN === 'true';
}

export type SettingsRunBriefSpendResolution = {
  pipelineDryRun: boolean;
  /** Client asked for `use_llm=true`. */
  paidLlmRequested: boolean;
  /** Real paid LLM path will run (not dry-run). */
  paidLlmEffective: boolean;
};

/**
 * Resolves whether settings POST should use pipeline dry-run vs paid directive generation.
 * - `dry_run=true` always wins (explicit free test).
 * - On Vercel prod with PROD_DEFAULT_PIPELINE_DRY_RUN: paid only if use_llm AND ALLOW_PROD_PAID_LLM.
 * - Otherwise: legacy behavior — not dry unless `dry_run=true`.
 */
export function resolveSettingsRunBriefPipelineDryRun(params: {
  explicitDryRun: boolean;
  useLlm: boolean;
}): SettingsRunBriefSpendResolution {
  const paidLlmRequested = params.useLlm;
  if (params.explicitDryRun) {
    return { pipelineDryRun: true, paidLlmRequested, paidLlmEffective: false };
  }
  if (isProdDefaultPipelineDryRunEnabled()) {
    const paidLlmEffective = paidLlmRequested && isAllowProdPaidLlmEnabled();
    return {
      pipelineDryRun: !paidLlmEffective,
      paidLlmRequested,
      paidLlmEffective,
    };
  }
  return {
    pipelineDryRun: false,
    paidLlmRequested,
    paidLlmEffective: true, // legacy prod: real directive path unless dry_run=true
  };
}
