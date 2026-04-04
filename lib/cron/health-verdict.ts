/**
 * Health Verdict — compute, persist, and auto-remediate after every nightly-ops cycle.
 *
 * computeAndPersistHealthVerdict() is called at the END of nightly-ops, after all stages
 * complete, for each user that was processed during the run.
 *
 * It queries tkg_actions (last 24h) to determine generation/delivery health, combines that
 * with the nightly-ops stages object for sync/processing health, classifies failure class,
 * writes to system_health, and runs drainStuckCandidate when INFINITE_LOOP is detected.
 */

import { createServerClient } from '@/lib/db/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthVerdict {
  user_id: string | null;
  run_type: string;

  sync_healthy: boolean;
  processing_healthy: boolean;
  generation_healthy: boolean;
  delivery_healthy: boolean;

  signals_synced: number;
  signals_processed: number;
  signals_unprocessed: number;
  candidates_evaluated: number;
  winner_action_type: string | null;
  winner_confidence: number | null;
  winner_persisted: boolean;
  winner_status: string | null;
  gate_that_blocked: string | null;
  email_sent: boolean;

  same_candidate_streak: number;
  streak_candidate_desc: string | null;

  failure_class: string | null;
  failure_detail: string | null;
  suggested_fix: string | null;
  cursor_prompt_ref: string | null;

  raw_receipt: Record<string, unknown>;
}

/** Partial shape of the nightly-ops stages object — only fields we actually read. */
interface NightlyOpsStages {
  sync_microsoft?: { ok: boolean; succeeded?: number; failed?: number };
  sync_google?: { ok: boolean; succeeded?: number; failed?: number };
  signal_processing?: {
    ok: boolean;
    total_processed?: number;
    remaining?: number;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gate → fix lookup table
// ---------------------------------------------------------------------------

function mapGateToFix(gate: string): string {
  const fixes: Record<string, string> = {
    below_send_threshold:
      'Generator confidence too low. Check SYSTEM_PROMPT confidence floor. See LESSONS_LEARNED.md #11',
    decision_enforcement_missing_explicit_ask:
      'Artifact missing ask language. Check EXPLICIT_ASK_PATTERNS alignment. See LESSONS_LEARNED.md #15',
    NO_CONCRETE_ASK:
      'Bottom gate: no concrete ask. Check evaluateBottomGate discrepancy exemption. See LESSONS_LEARNED.md #15',
    NO_REAL_PRESSURE:
      'Bottom gate: no pressure. Check evaluateBottomGate discrepancy exemption. See LESSONS_LEARNED.md #15',
    generic_language:
      'Artifact has generic opener. Check GENERIC_LANGUAGE_PATTERN and discrepancy exemption',
    weak_winner_no_pressure:
      'Artifact is polished sludge. Generator prompt needs more forcing function language',
    placeholder_content:
      'Artifact has [brackets] or TODOs. Generator hallucinating. Check signal quality',
    invalid_recipient:
      'No valid email in artifact.to. Candidate may be non-email-addressable',
    self_addressed:
      'Email addressed to Brandon. Entity resolution bug',
    do_nothing_directive:
      'Generator chose do_nothing. Check if candidate was structurally unsendable',
    body_too_short:
      'Email body under 30 chars. Generator produced stub',
    vague_subject:
      'Subject line is vague. Generator prompt needs subject quality rule',
    schedule_conflict_not_finished_outbound:
      'Schedule conflict produced owner-procedure memo, not outbound message',
  };
  return (
    fixes[gate] ??
    `Unknown gate: ${gate}. Trace isSendWorthy and evaluateBottomGate manually.`
  );
}

// ---------------------------------------------------------------------------
// Infinite loop detector
// ---------------------------------------------------------------------------

/**
 * Query the last 5 tkg_actions rows for the user and detect repeated candidates.
 * Checks BOTH directive_text AND execution_result.original_candidate.candidate_description
 * so the overlap fires even when directive_text is the wait_rationale fallback text.
 * Returns { streak, desc } where streak >= 3 indicates an infinite loop.
 */
async function detectInfiniteLoop(
  userId: string,
): Promise<{ streak: number; desc: string | null }> {
  const supabase = createServerClient();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000 * 7).toISOString();

  const { data: actions } = await supabase
    .from('tkg_actions')
    .select('directive_text, execution_result, status')
    .eq('user_id', userId)
    .gte('generated_at', oneDayAgo)
    .order('generated_at', { ascending: false })
    .limit(5);

  if (!actions || actions.length < 3) {
    return { streak: 0, desc: null };
  }

  // Extract the best candidate description from each row: prefer original_candidate over directive_text
  const descriptions: string[] = actions.map((a) => {
    const er = a.execution_result as Record<string, unknown> | null;
    const orig = er?.original_candidate as Record<string, unknown> | undefined;
    const origDesc =
      typeof orig?.candidate_description === 'string' ? orig.candidate_description : '';
    const directiveText = typeof a.directive_text === 'string' ? a.directive_text : '';
    return (origDesc || directiveText).toLowerCase().trim();
  });

  // Compute word overlap between the first (most recent) description and the rest.
  const refWords = descriptions[0]
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  if (refWords.length === 0) return { streak: 0, desc: null };

  let streak = 1; // count self
  for (let i = 1; i < descriptions.length; i++) {
    const text = descriptions[i];
    if (!text) break;
    const matched = refWords.filter((w) => text.includes(w)).length;
    if (matched / refWords.length >= 0.8) {
      streak++;
    } else {
      break;
    }
  }

  if (streak >= 3) {
    return { streak, desc: descriptions[0].slice(0, 200) };
  }
  return { streak: 0, desc: null };
}

// ---------------------------------------------------------------------------
// drainStuckCandidate
// ---------------------------------------------------------------------------

/**
 * When an INFINITE_LOOP is detected, mark the stuck candidate's recent rows with
 * { drained: true, drained_at: now() } in execution_result so the scorer's overlap
 * check sees the flag and the -50 rotation penalty fires on the next run.
 */
export async function drainStuckCandidate(
  userId: string,
  candidateDesc: string,
): Promise<{ drained: number }> {
  const supabase = createServerClient();
  const sevenDaysAgo = new Date(Date.now() - 24 * 60 * 60 * 1000 * 7).toISOString();

  // Find rows that match the stuck candidate (use the same overlap logic as detection)
  const { data: actions } = await supabase
    .from('tkg_actions')
    .select('id, execution_result, directive_text')
    .eq('user_id', userId)
    .gte('generated_at', sevenDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(5);

  if (!actions || actions.length === 0) return { drained: 0 };

  const refWords = candidateDesc
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  if (refWords.length === 0) return { drained: 0 };

  const drainedAt = new Date().toISOString();
  let drained = 0;

  for (const action of actions) {
    const er = action.execution_result as Record<string, unknown> | null;
    // Skip already-drained rows
    if ((er as Record<string, unknown> | null)?.drained === true) continue;

    const orig = er?.original_candidate as Record<string, unknown> | undefined;
    const origDesc =
      typeof orig?.candidate_description === 'string'
        ? orig.candidate_description.toLowerCase()
        : '';
    const directiveText =
      typeof action.directive_text === 'string' ? action.directive_text.toLowerCase() : '';
    const combinedText = `${origDesc} ${directiveText}`;
    const matched = refWords.filter((w) => combinedText.includes(w)).length;
    if (matched / refWords.length < 0.8) continue;

    const { error } = await supabase
      .from('tkg_actions')
      .update({
        execution_result: { ...(er ?? {}), drained: true, drained_at: drainedAt },
      })
      .eq('id', action.id as string);

    if (!error) drained++;
  }

  return { drained };
}

// ---------------------------------------------------------------------------
// Main verdict computation
// ---------------------------------------------------------------------------

/**
 * Compute a health verdict for a single user based on:
 * - The nightly-ops stages object (sync + signal processing)
 * - The last 24h of tkg_actions (generation + delivery)
 */
export async function computeHealthVerdict(
  userId: string,
  stages: NightlyOpsStages,
): Promise<HealthVerdict> {
  const supabase = createServerClient();

  // --- Sync health (from stages) ---
  const msSynced = (stages.sync_microsoft?.succeeded ?? 0) > 0 || (stages.sync_microsoft?.ok === true && (stages.sync_microsoft?.failed ?? 0) === 0);
  const gSynced = (stages.sync_google?.succeeded ?? 0) > 0 || (stages.sync_google?.ok === true && (stages.sync_google?.failed ?? 0) === 0);
  // "sync healthy" = at least one provider succeeded OR had 0 users to sync (ok=true)
  const syncHealthy =
    (stages.sync_microsoft?.ok === true) || (stages.sync_google?.ok === true);
  const signalsSynced =
    (stages.sync_microsoft?.succeeded ?? 0) + (stages.sync_google?.succeeded ?? 0);

  // --- Processing health (from stages) ---
  const sigProc = stages.signal_processing;
  const signalsProcessed = sigProc?.total_processed ?? 0;
  const signalsUnprocessed = sigProc?.remaining ?? 0;
  const processingHealthy =
    sigProc?.ok === true && (signalsProcessed > 0 || signalsUnprocessed === 0);

  // Suppress unused warning
  void msSynced;
  void gSynced;

  // --- Generation health (query tkg_actions last 24h) ---
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentActions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, status, execution_result, directive_text')
    .eq('user_id', userId)
    .gte('generated_at', oneDayAgo)
    .order('generated_at', { ascending: false })
    .limit(20);

  const actions = recentActions ?? [];

  // Best non-do_nothing action (persisted real candidate)
  const persistedAction = actions.find(
    (a) => a.status === 'pending_approval' || a.status === 'approved' || a.status === 'executed',
  );

  // Any action (includes do_nothing skipped)
  const anyAction = actions[0] ?? null;

  const winnerActionType =
    (persistedAction?.action_type as string | null) ??
    (anyAction?.action_type as string | null) ??
    null;
  const winnerConfidence =
    (persistedAction?.confidence as number | null) ??
    (anyAction?.confidence as number | null) ??
    null;
  const winnerPersisted = !!persistedAction;
  const winnerStatus =
    (persistedAction?.status as string | null) ?? (anyAction?.status as string | null) ?? null;

  // Count candidates evaluated (approximate: non-do_nothing rows + skipped)
  const candidatesEvaluated = actions.filter(
    (a) => a.action_type !== 'do_nothing',
  ).length;

  const generationHealthy = winnerPersisted;

  // Gate that blocked (from the most recent skipped non-do_nothing row)
  const blockedAction = actions.find((a) => {
    if (a.status !== 'skipped') return false;
    const er = a.execution_result as Record<string, unknown> | null;
    const noSend = er?.no_send as Record<string, unknown> | undefined;
    return !!noSend?.reason;
  });
  const gateBlocked = blockedAction
    ? (() => {
        const er = blockedAction.execution_result as Record<string, unknown>;
        const noSend = er?.no_send as Record<string, unknown> | undefined;
        return (noSend?.reason as string | null) ?? null;
      })()
    : null;

  // --- Delivery health ---
  const sentAction = actions.find((a) => {
    const er = a.execution_result as Record<string, unknown> | null;
    return typeof er?.daily_brief_sent_at === 'string';
  });
  const emailSent = !!sentAction;
  const deliveryHealthy = emailSent;

  // --- Infinite loop detection ---
  const { streak, desc: streakDesc } = await detectInfiniteLoop(userId);

  // --- Failure classification ---
  let failureClass: string | null = null;
  let failureDetail: string | null = null;
  let suggestedFix: string | null = null;
  let cursorPromptRef: string | null = null;

  // Priority order matters: check most severe first
  if (streak >= 3) {
    failureClass = 'INFINITE_LOOP';
    failureDetail = streakDesc;
    suggestedFix =
      'Same candidate winning 3+ times. Check candidate drain logic. See LESSONS_LEARNED.md #16, #17';
    cursorPromptRef = 'LESSONS_LEARNED.md #16 #17 — candidate drain + scorer overlap fix';
  } else if (!syncHealthy) {
    failureClass = 'SYNC_DEAD';
    suggestedFix =
      'Check Microsoft/Google OAuth token status in user_tokens';
    cursorPromptRef = 'See LESSONS_LEARNED.md #1, check token watchdog';
  } else if (signalsProcessed === 0 && signalsUnprocessed > 0) {
    failureClass = 'PROCESSING_STALLED';
    suggestedFix =
      'Check encryption key, signal processor, Haiku API balance';
    cursorPromptRef = 'See AB21 decrypt fix pattern in AUTOMATION_BACKLOG.md';
  } else if (candidatesEvaluated === 0 && actions.length > 0 && !winnerPersisted) {
    failureClass = 'NO_CANDIDATES';
    suggestedFix =
      'Check scorer threshold, entity/commitment counts, signal freshness';
    cursorPromptRef = 'Check scoreOpenLoops() candidate pool in lib/briefing/scorer.ts';
  } else if (candidatesEvaluated > 0 && !winnerPersisted && gateBlocked) {
    failureClass = 'GATE_BLOCKED';
    failureDetail = gateBlocked;
    suggestedFix = mapGateToFix(gateBlocked);
    cursorPromptRef = 'Trace isSendWorthy and evaluateBottomGate in lib/cron/daily-brief-generate.ts';
  } else if (winnerPersisted && !emailSent) {
    failureClass = 'DELIVERY_FAILED';
    suggestedFix =
      'Check Resend API key, verified email, daily send dedup';
    cursorPromptRef = 'Check lib/cron/daily-brief-send.ts runDailySend and getVerifiedDailyBriefRecipientEmail';
  } else if (syncHealthy && processingHealthy && generationHealthy && deliveryHealthy) {
    failureClass = null; // GREEN
  }

  const verdict: HealthVerdict = {
    user_id: userId,
    run_type: 'nightly',

    sync_healthy: syncHealthy,
    processing_healthy: processingHealthy,
    generation_healthy: generationHealthy,
    delivery_healthy: deliveryHealthy,

    signals_synced: signalsSynced,
    signals_processed: signalsProcessed,
    signals_unprocessed: signalsUnprocessed,
    candidates_evaluated: candidatesEvaluated,
    winner_action_type: winnerActionType,
    winner_confidence: typeof winnerConfidence === 'number' ? winnerConfidence : null,
    winner_persisted: winnerPersisted,
    winner_status: winnerStatus,
    gate_that_blocked: gateBlocked,
    email_sent: emailSent,

    same_candidate_streak: streak,
    streak_candidate_desc: streakDesc,

    failure_class: failureClass,
    failure_detail: failureDetail,
    suggested_fix: suggestedFix,
    cursor_prompt_ref: cursorPromptRef,

    raw_receipt: {
      stages_summary: {
        sync_microsoft_ok: stages.sync_microsoft?.ok,
        sync_google_ok: stages.sync_google?.ok,
        signal_processing_ok: stages.signal_processing?.ok,
        total_processed: signalsProcessed,
        remaining: signalsUnprocessed,
      },
      action_count_24h: actions.length,
      persisted_action_id: persistedAction?.id ?? null,
    },
  };

  return verdict;
}

// ---------------------------------------------------------------------------
// Persist to system_health
// ---------------------------------------------------------------------------

export async function persistHealthVerdict(verdict: HealthVerdict): Promise<{ id: string | null }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('system_health')
    .insert({
      user_id: verdict.user_id,
      run_type: verdict.run_type,
      sync_healthy: verdict.sync_healthy,
      processing_healthy: verdict.processing_healthy,
      generation_healthy: verdict.generation_healthy,
      delivery_healthy: verdict.delivery_healthy,
      signals_synced: verdict.signals_synced,
      signals_processed: verdict.signals_processed,
      signals_unprocessed: verdict.signals_unprocessed,
      candidates_evaluated: verdict.candidates_evaluated,
      winner_action_type: verdict.winner_action_type,
      winner_confidence: verdict.winner_confidence,
      winner_persisted: verdict.winner_persisted,
      winner_status: verdict.winner_status,
      gate_that_blocked: verdict.gate_that_blocked,
      email_sent: verdict.email_sent,
      same_candidate_streak: verdict.same_candidate_streak,
      streak_candidate_desc: verdict.streak_candidate_desc,
      failure_class: verdict.failure_class,
      failure_detail: verdict.failure_detail,
      suggested_fix: verdict.suggested_fix,
      cursor_prompt_ref: verdict.cursor_prompt_ref,
      raw_receipt: verdict.raw_receipt,
    })
    .select('id')
    .single();

  if (error) {
    console.error(
      JSON.stringify({ event: 'health_verdict_persist_error', error: error.message }),
    );
    return { id: null };
  }

  return { id: (data as { id: string }).id };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator called from nightly-ops
// ---------------------------------------------------------------------------

/**
 * Compute + persist the health verdict for a user.
 * If INFINITE_LOOP is detected, also runs drainStuckCandidate.
 * Fire-and-forget friendly — catches all errors internally.
 */
export async function computeAndPersistHealthVerdict(
  userId: string,
  stages: Record<string, unknown>,
): Promise<HealthVerdict | null> {
  try {
    const verdict = await computeHealthVerdict(userId, stages as NightlyOpsStages);
    await persistHealthVerdict(verdict);

    if (
      verdict.failure_class === 'INFINITE_LOOP' &&
      verdict.same_candidate_streak >= 3 &&
      verdict.streak_candidate_desc
    ) {
      const drainResult = await drainStuckCandidate(userId, verdict.streak_candidate_desc);
      console.log(
        JSON.stringify({
          event: 'health_verdict_auto_drain',
          userId,
          drained: drainResult.drained,
          streak: verdict.same_candidate_streak,
          desc: verdict.streak_candidate_desc?.slice(0, 80),
        }),
      );
    }

    console.log(
      JSON.stringify({
        event: 'health_verdict_computed',
        userId,
        failure_class: verdict.failure_class ?? 'GREEN',
        sync_healthy: verdict.sync_healthy,
        processing_healthy: verdict.processing_healthy,
        generation_healthy: verdict.generation_healthy,
        delivery_healthy: verdict.delivery_healthy,
      }),
    );

    return verdict;
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        event: 'health_verdict_error',
        userId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Health line string builder (used by daily-brief-send.ts for owner email)
// ---------------------------------------------------------------------------

/**
 * Build a one-line health status string from the latest system_health row for a user.
 * Returns null if no row found or on error.
 */
export async function buildHealthLineForUser(userId: string): Promise<string | null> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('system_health')
      .select(
        'failure_class, failure_detail, signals_processed, candidates_evaluated, winner_action_type, winner_confidence, same_candidate_streak',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) return null;

    const row = data as {
      failure_class: string | null;
      failure_detail: string | null;
      signals_processed: number;
      candidates_evaluated: number;
      winner_action_type: string | null;
      winner_confidence: number | null;
      same_candidate_streak: number;
    };

    if (!row.failure_class) {
      // GREEN
      const parts: string[] = ['System: GREEN'];
      if (row.signals_processed > 0) parts.push(`${row.signals_processed} signals`);
      if (row.candidates_evaluated > 0) parts.push(`${row.candidates_evaluated} candidates`);
      if (row.winner_action_type && row.winner_confidence != null) {
        parts.push(`winner: ${row.winner_action_type} @ ${row.winner_confidence}`);
      }
      return parts.join(' | ');
    }

    // RED
    const detail =
      row.failure_class === 'INFINITE_LOOP' && row.same_candidate_streak >= 3
        ? `Same candidate ${row.same_candidate_streak}x`
        : (row.failure_detail ?? row.failure_class);
    return `System: RED — ${row.failure_class} | ${detail} | See dashboard`;
  } catch {
    return null;
  }
}
