export const NIGHTLY_OPS_INGEST_STAGE_ORDER = [
  'commitment_ceiling_pre',
  'token_refresh_pre',
  'sync_microsoft',
  'sync_google',
  'connector_health',
  'sync_staleness',
  'signal_processing',
  'passive_rejection',
] as const;
