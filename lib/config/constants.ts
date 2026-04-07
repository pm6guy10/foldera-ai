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
export const MS_14D = daysMs(14);
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
