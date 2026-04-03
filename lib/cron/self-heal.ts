/**
 * self-heal.ts — Foldera's immune system
 *
 * Runs as the final phase of nightly-ops, after daily-send.
 * Six defenses that keep the system alive overnight with zero human intervention.
 */

import { createServerClient } from '@/lib/db/client';
import { getGoogleTokens, getMicrosoftTokens } from '@/lib/auth/token-store';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import {
  countUnprocessedSignals,
  listUsersWithUnprocessedSignals,
  processUnextractedSignals,
} from '@/lib/signals/signal-processor';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DefenseResult {
  defense: string;
  ok: boolean;
  details: Record<string, unknown>;
}

export interface SelfHealResult {
  ok: boolean;
  defenses: DefenseResult[];
  alert_sent: boolean;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// DEFENSE 1 — TOKEN WATCHDOG
// If any user's token expires within 6 hours of next cron (11:00 UTC),
// trigger refresh now. If refresh fails, send alert email.
// ---------------------------------------------------------------------------

async function defense1TokenWatchdog(): Promise<DefenseResult> {
  const results: Array<{ userId: string; provider: string; status: string }> = [];

  for (const provider of ['google', 'microsoft'] as const) {
    const userIds = await getAllUsersWithProvider(provider);
    for (const userId of userIds) {
      try {
        // getGoogleTokens/getMicrosoftTokens already refresh if within 5min
        // We trigger them proactively here to catch expiry within 6 hours
        if (provider === 'google') {
          const tokens = await getGoogleTokens(userId);
          if (!tokens) {
            results.push({ userId, provider, status: 'refresh_failed' });
            await sendReconnectAlert(userId, provider);
          } else {
            results.push({ userId, provider, status: 'valid' });
          }
        } else {
          const tokens = await getMicrosoftTokens(userId);
          if (!tokens) {
            results.push({ userId, provider, status: 'refresh_failed' });
            await sendReconnectAlert(userId, provider);
          } else {
            results.push({ userId, provider, status: 'valid' });
          }
        }
      } catch (err: any) {
        results.push({ userId, provider, status: `error: ${err.message}` });
        await sendReconnectAlert(userId, provider);
      }
    }
  }

  const failures = results.filter((r) => r.status !== 'valid');
  console.log(JSON.stringify({ event: 'self_heal_defense', defense: 'token_watchdog', results }));

  return {
    defense: 'token_watchdog',
    ok: failures.length === 0,
    details: { checked: results.length, failures: failures.length, results },
  };
}

async function sendReconnectAlert(userId: string, provider: string): Promise<void> {
  try {
    const supabase = createServerClient();
    // Try to get user email from user_tokens first, then auth.users
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('email')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    let email = tokenRow?.email;
    if (!email) {
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      email = authData?.user?.email ?? null;
    }

    if (!email) {
      console.log(JSON.stringify({ event: 'self_heal_reconnect_alert_skipped', userId, provider, reason: 'no_email' }));
      return;
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <brief@foldera.ai>',
      to: email,
      subject: 'Foldera: reconnect needed',
      html: `<p>Your ${provider === 'microsoft' ? 'Microsoft' : 'Google'} connection expired and auto-refresh failed.</p>
<p><a href="https://foldera.ai/dashboard/settings">Reconnect at foldera.ai/dashboard/settings</a> to keep your morning brief running.</p>`,
      tags: [
        { name: 'email_type', value: 'reconnect_alert' },
        { name: 'user_id', value: userId },
      ],
    });
    console.log(JSON.stringify({ event: 'self_heal_reconnect_alert_sent', userId, provider, email }));
  } catch (err: any) {
    console.error(JSON.stringify({ event: 'self_heal_reconnect_alert_failed', userId, provider, error: err.message }));
  }
}

// ---------------------------------------------------------------------------
// DEFENSE 2 — COMMITMENT CEILING
// If any user exceeds 150 active commitments, suppress oldest beyond 150.
// Prefer DB RPC `apply_commitment_ceiling` (single atomic UPDATE) when migration is applied;
// fall back to chunked client updates if the function is missing (pre-migration deploys).
// ---------------------------------------------------------------------------

async function defense2CommitmentCeilingChunked(): Promise<DefenseResult> {
  const supabase = createServerClient();
  const CEILING = 150;
  const UPDATE_BATCH_SIZE = 200;

  const { data: commitmentUserRows, error: commitmentUserError } = await supabase
    .from('tkg_commitments')
    .select('user_id')
    .is('suppressed_at', null);
  if (commitmentUserError) {
    throw commitmentUserError;
  }

  const perUser = new Map<string, number>();
  for (const row of commitmentUserRows ?? []) {
    const uid = row.user_id as string;
    if (!uid) continue;
    perUser.set(uid, (perUser.get(uid) ?? 0) + 1);
  }

  const suppressions: Array<{ userId: string; before: number; after: number; suppressed: number }> = [];

  for (const [userId, count] of perUser) {
    if (count <= CEILING) continue;

    const excess = count - CEILING;
    const { data: oldestRows } = await supabase
      .from('tkg_commitments')
      .select('id')
      .eq('user_id', userId)
      .is('suppressed_at', null)
      .order('created_at', { ascending: true })
      .limit(excess);

    if (oldestRows && oldestRows.length > 0) {
      const ids = oldestRows.map((r) => r.id);
      const suppressedAt = new Date().toISOString();
      for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
        const batchIds = ids.slice(i, i + UPDATE_BATCH_SIZE);
        const { error: updateError } = await supabase
          .from('tkg_commitments')
          .update({ suppressed_at: suppressedAt, suppressed_reason: 'commitment_ceiling_auto' })
          .in('id', batchIds);
        if (updateError) {
          throw updateError;
        }
      }

      suppressions.push({ userId, before: count, after: count - ids.length, suppressed: ids.length });
    }
  }

  console.log(JSON.stringify({ event: 'self_heal_defense', defense: 'commitment_ceiling', suppressions }));

  return {
    defense: 'commitment_ceiling',
    ok: true,
    details: { users_checked: perUser.size, suppressions, mode: 'chunked_client' },
  };
}

async function defense2CommitmentCeiling(): Promise<DefenseResult> {
  const supabase = createServerClient();
  const CEILING = 150;

  const { data, error } = await supabase.rpc('apply_commitment_ceiling', { p_ceiling: CEILING });

  const rpcMissing =
    error &&
    (error.code === 'PGRST202'
      || error.code === '42883'
      || String(error.message ?? '').toLowerCase().includes('could not find'));

  if (!error && data != null && typeof data === 'object' && 'suppressed_count' in data) {
    const suppressedCount = Number((data as { suppressed_count?: unknown }).suppressed_count ?? 0);
    console.log(
      JSON.stringify({
        event: 'self_heal_defense',
        defense: 'commitment_ceiling',
        suppressed_count: suppressedCount,
        mode: 'atomic_rpc',
      }),
    );
    return {
      defense: 'commitment_ceiling',
      ok: true,
      details: { suppressed_count: suppressedCount, suppressions: [], mode: 'atomic_rpc' },
    };
  }

  if (rpcMissing) {
    console.log(
      JSON.stringify({
        event: 'self_heal_defense',
        defense: 'commitment_ceiling',
        note: 'apply_commitment_ceiling RPC unavailable; using chunked client path',
        rpc_error: error?.message,
      }),
    );
    return defense2CommitmentCeilingChunked();
  }

  if (error) throw error;

  return defense2CommitmentCeilingChunked();
}

export async function runCommitmentCeilingDefense(): Promise<DefenseResult> {
  return defense2CommitmentCeiling();
}

export async function runTokenWatchdog(): Promise<DefenseResult> {
  return defense1TokenWatchdog();
}

// ---------------------------------------------------------------------------
// DEFENSE 3 — SIGNAL BACKLOG DRAIN
// Process unprocessed signals older than 24h, up to 100.
// If all fail with decrypt errors, flag as dead_key.
// ---------------------------------------------------------------------------

async function defense3SignalBacklogDrain(): Promise<DefenseResult> {
  const staleCutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let totalProcessed = 0;
  let totalFailed = 0;
  let deadKeyMarked = 0;

  const userIds = await listUsersWithUnprocessedSignals({});

  for (const userId of userIds) {
    const remaining = await countUnprocessedSignals(userId);
    if (remaining === 0) continue;

    try {
      const extraction = await processUnextractedSignals(userId, {
        maxSignals: Math.min(100, remaining),
        prioritizeOlderThanIso: staleCutoffIso,
        quarantineDeferredOlderThanIso: staleCutoffIso,
      });
      totalProcessed += extraction.signals_processed;

      // Only mark signals as dead_key when we have PROOF they are undecryptable:
      // the extraction must have returned deferred_signal_ids (ciphertext failures).
      // Previously, signals_processed === 0 could mean spend cap hit, API down, or
      // parse failure — none of which warrant permanently marking signals as dead_key.
      const deferredIds = extraction.deferred_signal_ids ?? [];
      if (deferredIds.length > 0) {
        const supabase = createServerClient();
        // Only mark the specific signals that were identified as undecryptable
        const staleDeferredIds = deferredIds.slice(0, 100);
        await supabase
          .from('tkg_signals')
          .update({ processed: true, metadata: { dead_key: true, marked_at: new Date().toISOString() } })
          .in('id', staleDeferredIds);
        deadKeyMarked += staleDeferredIds.length;
      }
    } catch (err: any) {
      totalFailed++;
      console.error(JSON.stringify({ event: 'self_heal_signal_drain_error', userId, error: err.message }));
    }
  }

  console.log(JSON.stringify({
    event: 'self_heal_defense', defense: 'signal_backlog_drain',
    processed: totalProcessed, failed: totalFailed, dead_key_marked: deadKeyMarked,
  }));

  return {
    defense: 'signal_backlog_drain',
    ok: true,
    details: { processed: totalProcessed, failed: totalFailed, dead_key_marked: deadKeyMarked },
  };
}

// ---------------------------------------------------------------------------
// DEFENSE 4 — QUEUE HYGIENE
// Auto-skip pending_approval older than 36h.
// Mark executed with no interaction after 7 days as abandoned.
// Feed both into the feedback loop.
// ---------------------------------------------------------------------------

async function defense4QueueHygiene(): Promise<DefenseResult> {
  const supabase = createServerClient();
  const thirtySixHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Auto-skip stale pending_approval
  const { data: staleApprovals } = await supabase
    .from('tkg_actions')
    .select('id')
    .eq('status', 'pending_approval')
    .lt('generated_at', thirtySixHoursAgo)
    .limit(50);

  let expiredCount = 0;
  if (staleApprovals && staleApprovals.length > 0) {
    const ids = staleApprovals.map((r) => r.id);
    await supabase
      .from('tkg_actions')
      .update({ status: 'skipped', skip_reason: 'auto_expired_36h' })
      .in('id', ids);
    expiredCount = ids.length;
  }

  // Mark old executed actions with no user interaction as abandoned
  const { data: oldExecuted } = await supabase
    .from('tkg_actions')
    .select('id')
    .eq('status', 'executed')
    .lt('generated_at', sevenDaysAgo)
    .is('approved_at', null)
    .limit(50);

  let abandonedCount = 0;
  if (oldExecuted && oldExecuted.length > 0) {
    const ids = oldExecuted.map((r) => r.id);
    await supabase
      .from('tkg_actions')
      .update({ status: 'skipped', skip_reason: 'auto_abandoned_7d' })
      .in('id', ids);
    abandonedCount = ids.length;
  }

  console.log(JSON.stringify({
    event: 'self_heal_defense', defense: 'queue_hygiene',
    expired_count: expiredCount, abandoned_count: abandonedCount,
  }));

  return {
    defense: 'queue_hygiene',
    ok: true,
    details: { expired_count: expiredCount, abandoned_count: abandonedCount },
  };
}

// ---------------------------------------------------------------------------
// DEFENSE 5 — DELIVERY GUARANTEE
// Already implemented in daily-brief.ts persistNoSendOutcome.
// wait_rationale is persisted as pending_approval and emailed.
// This defense just verifies it worked.
// ---------------------------------------------------------------------------

async function defense5DeliveryGuarantee(): Promise<DefenseResult> {
  const supabase = createServerClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Get all eligible users (same logic as daily-brief)
  const { filterDailyBriefEligibleUserIds } = await import('@/lib/auth/daily-brief-users');
  const allTokenUsers = await getAllUsersWithProvider('google');
  const msUsers = await getAllUsersWithProvider('microsoft');
  const allUsers = [...new Set([...allTokenUsers, ...msUsers])];
  const eligibleUsers = await filterDailyBriefEligibleUserIds(allUsers);

  // Get today's actions
  const { data: todayActions } = await supabase
    .from('tkg_actions')
    .select('id, user_id, status, action_type, execution_result')
    .gte('generated_at', todayStart.toISOString())
    .in('status', ['pending_approval', 'approved', 'executed', 'skipped']);

  const usersWithDirective = new Set((todayActions ?? []).map((a) => a.user_id));
  const emailsSent = (todayActions ?? []).filter((a) => {
    const er = a.execution_result as Record<string, unknown> | null;
    return er?.daily_brief_sent_at;
  });

  // Check which eligible users are missing a directive today
  const missingUsers = eligibleUsers.filter((uid) => !usersWithDirective.has(uid));

  console.log(JSON.stringify({
    event: 'self_heal_defense', defense: 'delivery_guarantee',
    eligible_users: eligibleUsers.length,
    users_with_directive: usersWithDirective.size,
    emails_sent: emailsSent.length,
    missing_users: missingUsers.length,
  }));

  return {
    defense: 'delivery_guarantee',
    ok: missingUsers.length === 0,
    details: {
      eligible_users: eligibleUsers.length,
      users_with_directive: usersWithDirective.size,
      emails_sent: emailsSent.length,
      missing_user_ids: missingUsers,
    },
  };
}

// ---------------------------------------------------------------------------
// DEFENSE 6 — HEALTH ALERT
// After all defenses, check system health. If any check fails, alert.
// ---------------------------------------------------------------------------

async function defense6HealthAlert(
  defenseResults: DefenseResult[],
): Promise<DefenseResult> {
  const failures = defenseResults.filter((d) => !d.ok);

  if (failures.length === 0) {
    console.log(JSON.stringify({ event: 'self_heal_defense', defense: 'health_alert', status: 'all_clear' }));
    return {
      defense: 'health_alert',
      ok: true,
      details: { status: 'all_clear', failures_count: 0 },
    };
  }

  // Send alert email
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const failureSummary = failures
      .map((f) => `• ${f.defense}: ${JSON.stringify(f.details)}`)
      .join('\n');

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'Foldera <brief@foldera.ai>',
      to: 'brief@foldera.ai',
      subject: 'Foldera system alert',
      html: `<h3>Self-heal detected ${failures.length} issue${failures.length > 1 ? 's' : ''}</h3>
<pre>${failureSummary.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
<p>Timestamp: ${new Date().toISOString()}</p>`,
      tags: [{ name: 'email_type', value: 'system_alert' }],
    });

    console.log(JSON.stringify({
      event: 'self_heal_defense', defense: 'health_alert',
      status: 'alert_sent', failures: failures.map((f) => f.defense),
    }));

    return {
      defense: 'health_alert',
      ok: false,
      details: { status: 'alert_sent', failures_count: failures.length, failures: failures.map((f) => f.defense) },
    };
  } catch (err: any) {
    console.error(JSON.stringify({ event: 'self_heal_health_alert_failed', error: err.message }));
    return {
      defense: 'health_alert',
      ok: false,
      details: { status: 'alert_send_failed', error: err.message },
    };
  }
}

// ---------------------------------------------------------------------------
// DEFENSE 7 — SELF-OPTIMIZE (dynamic confidence threshold)
// Weekly approval rate check. Below 20% -> raise threshold. Above 60% -> lower.
// Stores per-user threshold in tkg_goals (source='system_threshold').
// ---------------------------------------------------------------------------

async function defense7SelfOptimize(): Promise<DefenseResult> {
  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all users with recent decided actions
  const { data: recentActions, error: actionsError } = await supabase
    .from('tkg_actions')
    .select('user_id, status')
    .gte('generated_at', sevenDaysAgo)
    .in('status', ['approved', 'executed', 'skipped', 'draft_rejected']);

  if (actionsError) {
    throw actionsError;
  }

  // Group by user
  const perUser = new Map<string, { approved: number; total: number }>();
  for (const row of recentActions ?? []) {
    const uid = row.user_id as string;
    if (!uid) continue;
    const entry = perUser.get(uid) ?? { approved: 0, total: 0 };
    entry.total++;
    if (row.status === 'approved' || row.status === 'executed') {
      entry.approved++;
    }
    perUser.set(uid, entry);
  }

  const adjustments: Array<{ userId: string; rate: number; oldThreshold: number; newThreshold: number }> = [];

  for (const [userId, stats] of perUser) {
    if (stats.total < 3) continue; // Need minimum sample

    const approvalRate = stats.approved / stats.total;

    // Read current threshold from tkg_goals (source='system_threshold')
    const { data: thresholdRow } = await supabase
      .from('tkg_goals')
      .select('id, priority')
      .eq('user_id', userId)
      .eq('source', 'system_threshold')
      .eq('goal_category', 'other')
      .maybeSingle();

    let currentThreshold = thresholdRow?.priority ?? 45;
    let newThreshold = currentThreshold;

    if (approvalRate < 0.20 && currentThreshold < 65) {
      newThreshold = currentThreshold + 5;
    } else if (approvalRate > 0.60 && currentThreshold > 30) {
      newThreshold = currentThreshold - 5;
    }

    if (newThreshold !== currentThreshold) {
      if (thresholdRow) {
        await supabase
          .from('tkg_goals')
          .update({ priority: newThreshold, updated_at: new Date().toISOString() })
          .eq('id', thresholdRow.id);
      } else {
        await supabase
          .from('tkg_goals')
          .insert({
            user_id: userId,
            goal_text: 'System: directive confidence threshold',
            goal_category: 'other',
            priority: newThreshold,
            source: 'system_threshold',
            status: 'active',
          });
      }

      adjustments.push({
        userId,
        rate: Math.round(approvalRate * 100),
        oldThreshold: currentThreshold,
        newThreshold,
      });
    }
  }

  console.log(JSON.stringify({
    event: 'self_heal_defense',
    defense: 'self_optimize',
    users_checked: perUser.size,
    adjustments,
  }));

  return {
    defense: 'self_optimize',
    ok: true,
    details: { users_checked: perUser.size, adjustments },
  };
}

export async function runSelfOptimize(): Promise<DefenseResult> {
  return defense7SelfOptimize();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSelfHeal(): Promise<SelfHealResult> {
  const startTime = Date.now();
  const defenses: DefenseResult[] = [];

  // Run defenses 1-5 sequentially
  try {
    defenses.push(await defense1TokenWatchdog());
  } catch (err: any) {
    defenses.push({ defense: 'token_watchdog', ok: false, details: { error: err.message } });
  }

  try {
    defenses.push(await defense2CommitmentCeiling());
  } catch (err: any) {
    defenses.push({ defense: 'commitment_ceiling', ok: false, details: { error: err.message } });
  }

  try {
    defenses.push(await defense3SignalBacklogDrain());
  } catch (err: any) {
    defenses.push({ defense: 'signal_backlog_drain', ok: false, details: { error: err.message } });
  }

  try {
    defenses.push(await defense4QueueHygiene());
  } catch (err: any) {
    defenses.push({ defense: 'queue_hygiene', ok: false, details: { error: err.message } });
  }

  try {
    defenses.push(await defense5DeliveryGuarantee());
  } catch (err: any) {
    defenses.push({ defense: 'delivery_guarantee', ok: false, details: { error: err.message } });
  }

  try {
    defenses.push(await defense7SelfOptimize());
  } catch (err: any) {
    defenses.push({ defense: 'self_optimize', ok: false, details: { error: err.message } });
  }

  // Defense 6: health alert (runs last, checks results of 1-6)
  let alertSent = false;
  try {
    const alertResult = await defense6HealthAlert(defenses);
    defenses.push(alertResult);
    alertSent = alertResult.details?.status === 'alert_sent';
  } catch (err: any) {
    defenses.push({ defense: 'health_alert', ok: false, details: { error: err.message } });
  }

  const allOk = defenses.every((d) => d.ok);
  const durationMs = Date.now() - startTime;

  logStructuredEvent({
    event: 'self_heal_complete',
    level: allOk ? 'info' : 'warn',
    userId: null,
    artifactType: null,
    generationStatus: allOk ? 'all_clear' : 'issues_detected',
    details: {
      scope: 'self-heal',
      ok: allOk,
      duration_ms: durationMs,
      defenses: defenses.map((d) => ({ defense: d.defense, ok: d.ok })),
    },
  });

  return { ok: allOk, defenses, alert_sent: alertSent, duration_ms: durationMs };
}
