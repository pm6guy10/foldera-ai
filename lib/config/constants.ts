/**
 * Shared pipeline constants.
 *
 * Import from here, never redeclare locally. This file is the single source
 * of truth so a value change propagates everywhere automatically.
 */

// ── Confidence thresholds ────────────────────────────────────────────────────

/**
 * Minimum confidence to persist a generated action to tkg_actions.
 * Actions below this are discarded at generation time.
 * Must stay in sync with cleanupPendingQueue in daily-brief.ts.
 */
export const CONFIDENCE_PERSIST_THRESHOLD = 45;

/**
 * Minimum confidence to surface an action to the user (email + dashboard).
 * Higher bar than PERSIST because we want to store borderline actions for
 * learning/tuning without actually bothering the user with them.
 */
export const CONFIDENCE_SEND_THRESHOLD = 70;

/**
 * `pending_approval` / `draft` rows older than this are auto-skipped at daily-generate start
 * (`drainStalePendingActionsForUser`). Health gate flags only rows older than this threshold.
 */
export const STALE_PENDING_APPROVAL_MAX_AGE_HOURS = 20;

// ── Signal retention ─────────────────────────────────────────────────────────

/** Signals older than this are pruned by nightly-ops. */
export const SIGNAL_RETENTION_DAYS = 180;

// ── Look-back windows (milliseconds) ─────────────────────────────────────────

/** Convert days → milliseconds. */
export const daysMs = (n: number): number => n * 24 * 60 * 60 * 1000;

export const MS_7D  = daysMs(7);
/** Settings / integrations: warn when mail sync timestamp has not advanced (stuck connector). */
export const INTEGRATIONS_SYNC_STALE_MS = daysMs(3);

/** When newest mail signal in the graph is older than this while a mail connector is connected, surface a settings warning (sync may be ingesting nothing). */
export const INTEGRATIONS_MAIL_GRAPH_STALE_MS = daysMs(7);

/**
 * After a successful incremental mail sync that inserted **zero** new mail signals, if
 * `user_tokens.last_synced_at` is farther ahead than this gap from `max(occurred_at)` for
 * that provider's mail source (`gmail` / `outlook`), rewind the cursor to the newest signal.
 * Prevents silent gaps when the incremental window advanced but nothing was persisted.
 * Tune in prod via `CURSOR_REWOUND` logs (tighten/loosen if false positives or misses).
 */
export const MAIL_CURSOR_HEAL_GAP_MS = daysMs(1);
export const MS_14D = daysMs(14);
/** Connector-health email: secondary source (Calendar / Drive / OneDrive) must be empty this long while primary mail syncs. */
export const CONNECTOR_HEALTH_EMAIL_SIGNAL_LOOKBACK_MS = MS_14D;
/** Skip connector-health email if the user loaded the dashboard recently (in-app reconnect is enough). */
export const CONNECTOR_HEALTH_EMAIL_SKIP_IF_DASHBOARD_VISIT_WITHIN_MS = MS_7D;
export const MS_30D = daysMs(30);
export const MS_90D = daysMs(90);
export const MS_1Y  = daysMs(365);
export const MS_2Y  = daysMs(730);

/**
 * How far back to pull signals on a user's FIRST sync (historical backfill).
 * Emails older than this won't be pulled even on initial connect.
 * Increase to build a richer historical graph.
 */
export const FIRST_SYNC_LOOKBACK_MS = MS_1Y;

/** How far back to look when checking sent-mail history for duplicate suppression. */
export const APPROVAL_LOOKBACK_MS = MS_7D;

// ── Test / synthetic users ───────────────────────────────────────────────────

/**
 * Synthetic test user excluded from all production cron runs.
 * Created by the stress-test route; never has real tokens.
 */
export const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';
