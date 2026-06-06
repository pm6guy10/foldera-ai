import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export type SourceEvidenceSignalFact = {
  signal_id: string;
  summary: string;
  relevance_reason: string;
  safe_reference: string;
};

export type SourceEvidenceFixture = {
  fixture_id: string;
  source_type: 'gmail_fixture' | 'calendar_fixture' | 'slack_fixture';
  source_id: string;
  source_label: string;
  observed_at: string;
  redacted_summary: string;
  signal_facts: SourceEvidenceSignalFact[];
};

export type NormalizedVerdictSignal = SourceEvidenceSignalFact & {
  source_type: SourceEvidenceFixture['source_type'];
  source_id: string;
  source_label: string;
  observed_at: string;
};

export type VerdictLoopKind = 'one_next_move' | 'safe_silence';

export type VerdictLoopReceipt = {
  receipt_id: string;
  durable_receipt_path: string;
  user_id: string;
  before_state: WorkdayPresenceState;
  source_evidence_fixture: SourceEvidenceFixture;
  normalized_signals: NormalizedVerdictSignal[];
  context: string;
  verdict: {
    kind: VerdictLoopKind;
    text: string;
  };
  selected_move: string | null;
  safe_silence_reason: string | null;
  rejected_competing_moves: string[];
  created_at: string;
};

function cleanSummary(value: string): string {
  return value.trim();
}

function normalizeSignals(fixture: SourceEvidenceFixture): NormalizedVerdictSignal[] {
  return fixture.signal_facts.map((signal) => ({
    ...signal,
    source_type: fixture.source_type,
    source_id: fixture.source_id,
    source_label: fixture.source_label,
    observed_at: fixture.observed_at,
    summary: cleanSummary(signal.summary),
    relevance_reason: cleanSummary(signal.relevance_reason),
    safe_reference: cleanSummary(signal.safe_reference),
  }));
}

function buildContext(fixture: SourceEvidenceFixture, signals: NormalizedVerdictSignal[]): string {
  return [fixture.redacted_summary, ...signals.map((signal) => signal.summary)]
    .map(cleanSummary)
    .filter((part) => part.length > 0)
    .join(' ');
}

function selectVerdict(input: {
  context: string;
  before_state: WorkdayPresenceState;
}): { kind: VerdictLoopKind; text: string; safe_silence_reason: string | null; selected_move: string | null } {
  const actionableCue =
    /(?:asked for|request(?:ed)?|needs?|need|confirm(?:ed)?|approval|final review|next move)/i.test(
      input.context,
    );
  const silenceCue =
    /(?:no action requested|status-only|informational only|FYI only|quiet|stay quiet)/i.test(
      input.context,
    );

  if (actionableCue && !silenceCue) {
    return {
      kind: 'one_next_move',
      text: input.before_state.next_move,
      safe_silence_reason: null,
      selected_move: input.before_state.next_move,
    };
  }

  const reason = 'Safe silence: the evidence is informational only and leaves no safe next move.';
  return {
    kind: 'safe_silence',
    text: reason,
    safe_silence_reason: reason,
    selected_move: null,
  };
}

export function buildVerdictLoopReceipt(input: {
  user_id: string;
  before_state: WorkdayPresenceState;
  source_evidence_fixture: SourceEvidenceFixture;
  nowIso?: string;
}): VerdictLoopReceipt {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const normalizedSignals = normalizeSignals(input.source_evidence_fixture);
  const context = buildContext(input.source_evidence_fixture, normalizedSignals);
  const verdict = selectVerdict({ context, before_state: input.before_state });

  return {
    receipt_id: `verdict_loop_194_${input.source_evidence_fixture.fixture_id}`,
    durable_receipt_path: 'lib/work-packets/verdict-loop.ts#buildVerdictLoopReceipt',
    user_id: input.user_id,
    before_state: input.before_state,
    source_evidence_fixture: input.source_evidence_fixture,
    normalized_signals: normalizedSignals,
    context,
    verdict: {
      kind: verdict.kind,
      text: verdict.text,
    },
    selected_move: verdict.selected_move,
    safe_silence_reason: verdict.safe_silence_reason,
    rejected_competing_moves: [],
    created_at: nowIso,
  };
}
