import type {
  WorkdayPresenceSourceTrailEntry,
  WorkdayPresenceState,
} from './model';

type SourceBackedRow = Record<string, unknown>;

export type ScoredWinnerInput = {
  title: string;
  score: number;
  matchedGoal?: { text: string } | null;
  sourceSignals?: Array<{
    id?: unknown;
    source?: unknown;
    kind?: unknown;
    summary?: unknown;
    occurredAt?: unknown;
  }>;
};

export type SourceBackedStateInput = {
  signals?: SourceBackedRow[];
  commitments?: SourceBackedRow[];
  actions?: SourceBackedRow[];
  nowIso?: string;
  /**
   * When provided, the scored winner is always used instead of recency-based
   * row selection. This enforces the #249 invariant: a Right Now card may not
   * be selected by recency when a scored open-loop winner exists.
   */
  scoredWinner?: ScoredWinnerInput;
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanId(value: unknown): string | undefined {
  return clean(value) ?? undefined;
}

function firstClean(row: SourceBackedRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return null;
}

function isSuppressed(row: SourceBackedRow): boolean {
  return Boolean(clean(row.suppressed_at) || clean(row.suppressed_reason));
}

function rowTime(row: SourceBackedRow): string | null {
  return firstClean(row, ['occurred_at', 'ingested_at', 'created_at', 'updated_at', 'generated_at']);
}

function byNewest(a: SourceBackedRow, b: SourceBackedRow): number {
  return (rowTime(b) ?? '').localeCompare(rowTime(a) ?? '');
}

function evidenceSummary(row: SourceBackedRow): string | null {
  const direct = firstClean(row, [
    'redacted_summary',
    'safe_summary',
    'summary',
    'subject',
    'title',
    'directive_text',
    'commitment_text',
    'description',
  ]);
  if (direct) return direct;

  const evidence = row.evidence;
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    return firstClean(evidence as SourceBackedRow, [
      'redacted_summary',
      'safe_summary',
      'summary',
      'subject',
      'title',
    ]);
  }
  return null;
}

function sourceTrail(input: {
  table: WorkdayPresenceSourceTrailEntry['table'];
  row: SourceBackedRow;
  summary: string;
  reason: string;
}): WorkdayPresenceSourceTrailEntry {
  return {
    table: input.table,
    source: firstClean(input.row, ['source', 'provider', 'connector']) ?? 'unknown_source',
    type: firstClean(input.row, ['type', 'signal_type', 'commitment_type', 'action_type']) ?? 'unknown_type',
    source_id: cleanId(input.row.source_id),
    row_id: cleanId(input.row.id),
    occurred_at: cleanId(input.row.occurred_at),
    ingested_at: cleanId(input.row.ingested_at ?? input.row.created_at),
    redacted_summary: input.summary,
    selection_reason: input.reason,
  };
}

function buildState(input: {
  focus: string;
  nextMove: string;
  why: string;
  trail: WorkdayPresenceSourceTrailEntry;
  nowIso: string;
  waitingOn?: string | null;
}): WorkdayPresenceState {
  return {
    current_focus: input.focus,
    next_move: input.nextMove,
    why_it_matters: input.why,
    blocker: null,
    do_not_touch: 'Do not auto-send or mutate source systems.',
    waiting_on: input.waitingOn ?? null,
    last_completed_step: null,
    state_source: 'source_backed',
    source_trail: [input.trail],
    draft: null,
    snoozed_until: null,
    interaction_history: [],
    created_at: input.nowIso,
    updated_at: input.nowIso,
  };
}

function stateFromCommitment(row: SourceBackedRow, nowIso: string): WorkdayPresenceState | null {
  if (isSuppressed(row)) return null;
  const status = firstClean(row, ['status', 'state']);
  if (status && ['done', 'completed', 'closed', 'suppressed'].includes(status.toLowerCase())) return null;

  const summary = evidenceSummary(row);
  if (!summary) return null;

  const owner = firstClean(row, ['owner_name', 'promisor_name', 'owner', 'promisor']);
  const due = firstClean(row, ['due_at', 'due_date', 'deadline']);
  const trail = sourceTrail({
    table: 'tkg_commitments',
    row,
    summary,
    reason: 'active commitment row is the safest source-backed next move',
  });
  const focus = firstClean(row, ['current_focus', 'project', 'entity_name', 'topic']) ?? 'Move active commitment forward';
  const nextMove = `Review the active commitment and take one human-confirmed next step: ${summary}`;
  const why = due
    ? `This commitment has a stored due signal (${due}) and should get one focused intervention.`
    : 'This commitment is stored as active source-backed work and should get one focused intervention.';

  return buildState({
    focus,
    nextMove,
    why,
    trail,
    nowIso,
    waitingOn: owner ? `Waiting on ${owner}` : null,
  });
}

function stateFromSignal(row: SourceBackedRow, nowIso: string): WorkdayPresenceState | null {
  const summary = evidenceSummary(row);
  if (!summary) return null;

  const source = firstClean(row, ['source', 'provider', 'connector']) ?? 'connected source';
  const signalType = firstClean(row, ['type', 'signal_type']) ?? 'signal';
  const trail = sourceTrail({
    table: 'tkg_signals',
    row,
    summary,
    reason: 'recent typed signal row provides a safe source-backed next move',
  });
  const focus = firstClean(row, ['current_focus', 'thread_subject', 'subject', 'title', 'entity_name'])
    ?? `Respond to ${source} ${signalType}`;

  return buildState({
    focus,
    nextMove: `Use the stored ${source} ${signalType} signal to take one reviewable next move: ${summary}`,
    why: `A consented ${source} row was selected as source-backed evidence without reading raw private content.`,
    trail,
    nowIso,
  });
}

function stateFromScoredWinner(winner: ScoredWinnerInput, nowIso: string): WorkdayPresenceState {
  const title = winner.title.trim() || 'Scored winner';
  const goal = winner.matchedGoal?.text?.trim() ?? null;

  return {
    current_focus: title,
    next_move: `Review and take the smallest next step: ${title}`,
    why_it_matters: goal
      ? `Matched goal: "${goal}". Score: ${winner.score.toFixed(2)}.`
      : `Top-scored open loop (score: ${winner.score.toFixed(2)}). No matched goal.`,
    blocker: null,
    do_not_touch: 'Do not auto-send or mutate source systems.',
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: (winner.sourceSignals ?? []).slice(0, 2).map((sig) => ({
      table: 'tkg_signals' as const,
      source: String(sig.source ?? 'unknown'),
      type: String(sig.kind ?? 'signal'),
      row_id: sig.id ? String(sig.id) : undefined,
      occurred_at: sig.occurredAt ? String(sig.occurredAt) : undefined,
      redacted_summary: String(sig.summary ?? sig.id ?? 'signal'),
      selection_reason: 'source signal for scored winner',
    })),
    draft: null,
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function actionEvidenceTrails(actions: SourceBackedRow[]): WorkdayPresenceSourceTrailEntry[] {
  return actions
    .map((row) => {
      const summary = evidenceSummary(row);
      if (!summary) return null;
      return sourceTrail({
        table: 'tkg_actions',
        row,
        summary,
        reason: 'optional action evidence corroborates the selected move',
      });
    })
    .filter((entry): entry is WorkdayPresenceSourceTrailEntry => Boolean(entry))
    .slice(0, 1);
}

export function selectSourceBackedRightNowState(
  input: SourceBackedStateInput,
): WorkdayPresenceState | null {
  const nowIso = input.nowIso ?? new Date().toISOString();

  // #249 invariant: scored winner always beats recency-ordered rows.
  if (input.scoredWinner) {
    return stateFromScoredWinner(input.scoredWinner, nowIso);
  }

  const commitments = [...(input.commitments ?? [])].sort(byNewest);
  const signals = [...(input.signals ?? [])].sort(byNewest);
  const actionTrail = actionEvidenceTrails(input.actions ?? []);

  const selected =
    commitments.map((row) => stateFromCommitment(row, nowIso)).find(Boolean) ??
    signals.map((row) => stateFromSignal(row, nowIso)).find(Boolean);

  if (!selected) return null;

  return {
    ...selected,
    source_trail: [...selected.source_trail, ...actionTrail].slice(0, 2),
  };
}
