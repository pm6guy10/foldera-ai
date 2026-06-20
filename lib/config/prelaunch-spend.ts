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

/**
 * SCOUT lane flags (issue #486). The proactive Scout is an additive, opt-in,
 * owner-first lane (see FOLDERA_MASTER_BIBLE.md Part V). Every flag is env-driven
 * and defaults OFF, so the Workday Presence Layer is the unchanged default until
 * the owner explicitly enables a lane. All Scout entry points must fail-closed
 * (no-op) when their flag is off, mirroring isAllowProdPaidLlmEnabled().
 */

/** Master switch for the entire Scout lane. When false, all Scout work no-ops. */
export function isScoutEnabled(): boolean {
  return process.env.SCOUT_ENABLED === 'true';
}

/** Drive full-index + RAG retrieval (the searchable second brain). */
export function isScoutRagEnabled(): boolean {
  return isScoutEnabled() && process.env.SCOUT_RAG_ENABLED === 'true';
}

/** Real web access (native server-side web_search) in the brief/scout path. */
export function isScoutWebEnabled(): boolean {
  return isScoutEnabled() && process.env.SCOUT_WEB_ENABLED === 'true';
}

/**
 * Slack-first delivery of finished Scout proposals. When off, the scout loop still
 * only RETURNS proposals — nothing is surfaced anywhere. When on, the delivery
 * layer notifies the owner on their own rails (the full proposal as a Slack card,
 * with email as an opt-in fallback). It never auto-sends an artifact to a third
 * party. Defaults OFF.
 */
export function isScoutDeliveryEnabled(): boolean {
  return isScoutEnabled() && process.env.SCOUT_DELIVERY_ENABLED === 'true';
}

/** Embeddings provider for Scout RAG. Voyage is Anthropic's recommended partner. */
export function getEmbeddingsProvider(): 'voyage' {
  const provider = process.env.EMBEDDINGS_PROVIDER?.trim().toLowerCase();
  return provider === 'voyage' ? 'voyage' : 'voyage';
}

/**
 * Whether Scout embeddings can run: RAG flag on AND a Voyage key is present.
 * The key itself is an owner-gated secret and is never read at module top level.
 */
export function isScoutEmbeddingsConfigured(): boolean {
  return isScoutRagEnabled() && Boolean(process.env.VOYAGE_API_KEY?.trim());
}
