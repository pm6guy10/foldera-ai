import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  buildQualityGateReport,
  type QualityGateStatus,
  type ReleaseGateSummary,
} from './quality-gate-status';
import {
  buildReleaseGateReport,
  gatherReleaseGateEvidence,
  type ReleaseGateStatus,
} from './release-gate-status';
import {
  buildVisualGateReport,
  gatherVisualGateEvidence,
  type VisualGateStatus,
} from './visual-gate-status';

export type { ReleaseGateSummary } from './quality-gate-status';

export type DecisionTraceGateStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface QualityGateSummary {
  gate: string;
  status: QualityGateStatus | 'UNKNOWN';
  reason: string;
}

export interface VisualGateSummary {
  gate: string;
  status: VisualGateStatus | 'UNKNOWN';
  reason: string;
}

export interface DecisionTraceSource {
  id: string;
  label: string;
  freshness: string;
  approvedSnippet: string;
}

export interface DecisionTraceCandidate {
  id: string;
  name: string;
  className: string;
  status: 'selected' | 'rejected' | 'blocked';
  plainEnglishReason: string;
  sourceIds: string[];
}

export interface DecisionTraceWinner {
  candidateId: string;
  name: string;
  whyThisWon: string;
  whyNow: string;
  evidenceSourceIds: string[];
  proposedFinishedMove: string;
  approvalState: string;
}

export interface DecisionTrace {
  sourcesRead: DecisionTraceSource[];
  sourceFreshnessSummary: string;
  candidates: DecisionTraceCandidate[];
  winner: DecisionTraceWinner | null;
  noSafeMoveReason?: string;
  sendNothingWhen: string[];
  userSafeSummary: string;
}

export interface DecisionTraceFixture {
  id: string;
  expected: 'PASS' | 'FAIL';
  title: string;
  trace: DecisionTrace;
}

export interface DecisionTraceEvaluation {
  passes: boolean;
  reasons: string[];
}

export interface DecisionTraceGateResult {
  id: 'QG_13_DECISION_TRACE_QUALITY';
  status: DecisionTraceGateStatus;
  reason: string;
  nextMove: string;
  doNotTouch: string;
}

export interface DecisionTraceGateReport {
  releaseGate: ReleaseGateSummary;
  qualityGate: QualityGateSummary;
  visualGate: VisualGateSummary;
  decisionTraceGate: DecisionTraceGateResult;
  firstFailingDecisionTraceGate: DecisionTraceGateResult | null;
  proofFound: string[];
  proofMissing: string[];
  fixtureResults: Array<{
    fixture: DecisionTraceFixture;
    result: DecisionTraceEvaluation;
  }>;
}

const DO_NOT_TOUCH =
  'UI polish, frontend redesign, paid generation, outbound email, Stripe, schema changes, fake users, owner-only proof, beta-readiness claims.';

const QG_13_ID = 'QG_13_DECISION_TRACE_QUALITY' as const;

const UNSAFE_TEXT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bbecause ai chose it\b/i, reason: 'magic_ai_explanation' },
  { pattern: /\b(chain[- ]of[- ]thought|private reasoning|hidden reasoning|scratchpad|reasoning trace)\b/i, reason: 'private_model_reasoning_exposed' },
  { pattern: /\b(raw[_ -]?score|scoring vector|embedding|token log|prompt dump|debug json|debug garbage|logprob|temperature|system prompt|internal rubric)\b/i, reason: 'internal_debug_or_scoring_terms_visible' },
  { pattern: /\bconfidence\b[^.\n]{0,40}\b\d{1,3}\s*%|\b\d{1,3}\s*%\s*confidence\b/i, reason: 'confidence_percentage_visible' },
  { pattern: /\b(Brandon|WorkSourceWA|unemployment|benefits|b\.kapp|b-kapp|OWNER_USER_ID|TEST_USER_ID|owner-only|private owner)\b/i, reason: 'private_owner_context_leaked' },
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function collectTraceText(trace: DecisionTrace): string {
  const parts = [
    trace.sourceFreshnessSummary,
    trace.noSafeMoveReason ?? '',
    trace.sendNothingWhen.join('\n'),
    trace.userSafeSummary,
    ...trace.sourcesRead.flatMap((source) => [
      source.id,
      source.label,
      source.freshness,
      source.approvedSnippet,
    ]),
    ...trace.candidates.flatMap((candidate) => [
      candidate.name,
      candidate.className,
      candidate.status,
      candidate.plainEnglishReason,
      candidate.sourceIds.join(' '),
    ]),
  ];
  if (trace.winner) {
    parts.push(
      trace.winner.name,
      trace.winner.whyThisWon,
      trace.winner.whyNow,
      trace.winner.evidenceSourceIds.join(' '),
      trace.winner.proposedFinishedMove,
      trace.winner.approvalState,
    );
  }
  return parts.join('\n');
}

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 5 &&
        ![
          'source',
          'email',
          'thread',
          'calendar',
          'document',
          'meeting',
          'today',
          'tomorrow',
          'fresh',
          'scheduled',
        ].includes(token),
    );
}

function evidenceSupportsWinner(trace: DecisionTrace, winner: DecisionTraceWinner): boolean {
  const sources = trace.sourcesRead.filter((source) =>
    winner.evidenceSourceIds.includes(source.id),
  );
  if (sources.length === 0) return false;
  const winnerText = [
    winner.name,
    winner.whyThisWon,
    winner.whyNow,
    winner.proposedFinishedMove,
  ]
    .join(' ')
    .toLowerCase();
  const sourceTokens = sources.flatMap((source) =>
    normalizedTokens(`${source.label} ${source.approvedSnippet}`),
  );
  return sourceTokens.some((token) => winnerText.includes(token));
}

export function evaluateDecisionTrace(
  fixture: DecisionTraceFixture,
): DecisionTraceEvaluation {
  const { trace } = fixture;
  const reasons: string[] = [];
  const sourceIds = new Set(trace.sourcesRead.map((source) => source.id));
  const selectedCandidates = trace.candidates.filter(
    (candidate) => candidate.status === 'selected',
  );
  const rejectedOrBlocked = trace.candidates.filter(
    (candidate) => candidate.status === 'rejected' || candidate.status === 'blocked',
  );
  const text = collectTraceText(trace);

  if (trace.sourcesRead.length === 0) reasons.push('missing_sources_read');
  if (!trace.sourceFreshnessSummary.trim()) reasons.push('missing_source_freshness');
  if (trace.candidates.length === 0) reasons.push('missing_candidate_list');
  if (rejectedOrBlocked.length === 0) reasons.push('rejected_or_blocked_candidates_hidden');
  if (trace.sendNothingWhen.length === 0) reasons.push('missing_send_nothing_condition');
  if (!trace.userSafeSummary.trim()) reasons.push('missing_user_safe_summary');

  for (const candidate of trace.candidates) {
    if (!candidate.name.trim()) reasons.push('candidate_missing_name');
    if (!candidate.className.trim()) reasons.push('candidate_missing_class');
    if (!candidate.plainEnglishReason.trim()) {
      reasons.push('candidate_missing_plain_english_reason');
    }
    if (candidate.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      reasons.push('candidate_references_unknown_source');
    }
  }

  if (trace.winner) {
    const selectedCandidate = trace.candidates.find(
      (candidate) => candidate.id === trace.winner?.candidateId,
    );
    if (!selectedCandidate) reasons.push('winner_missing_from_candidate_list');
    if (selectedCandidate && selectedCandidate.status !== 'selected') {
      reasons.push('winner_candidate_not_marked_selected');
    }
    if (selectedCandidates.length !== 1) reasons.push('selected_candidate_count_not_one');
    if (!trace.winner.whyThisWon.trim()) reasons.push('missing_why_this_won');
    if (!trace.winner.whyNow.trim()) reasons.push('missing_why_now');
    if (trace.winner.evidenceSourceIds.length === 0) {
      reasons.push('missing_winner_evidence_source_trail');
    }
    if (trace.winner.evidenceSourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      reasons.push('winner_references_unknown_source');
    }
    if (!evidenceSupportsWinner(trace, trace.winner)) {
      reasons.push('source_trail_does_not_support_winner');
    }
    if (!trace.winner.proposedFinishedMove.trim()) {
      reasons.push('missing_proposed_finished_move');
    }
    if (!trace.winner.approvalState.trim()) reasons.push('missing_approval_state');
  } else {
    if (!trace.noSafeMoveReason?.trim()) reasons.push('missing_no_safe_move_reason');
    if (selectedCandidates.length > 0) reasons.push('no_safe_move_has_selected_candidate');
    if (!/\b(no safe move|nothing strong enough|send nothing|wait)\b/i.test(text)) {
      reasons.push('no_safe_move_not_clear');
    }
  }

  for (const unsafe of UNSAFE_TEXT_PATTERNS) {
    if (unsafe.pattern.test(text)) reasons.push(unsafe.reason);
  }

  return {
    passes: reasons.length === 0,
    reasons: unique(reasons),
  };
}

const baseSources: DecisionTraceSource[] = [
  {
    id: 'src_customer_thread',
    label: 'Customer email thread',
    freshness: 'Fresh today',
    approvedSnippet: 'Maya asked for the implementation date before Thursday planning.',
  },
  {
    id: 'src_calendar_planning',
    label: 'Planning calendar hold',
    freshness: 'Tomorrow',
    approvedSnippet: 'Thursday planning meeting is scheduled for tomorrow morning.',
  },
  {
    id: 'src_vendor_note',
    label: 'Vendor renewal note',
    freshness: 'Fresh yesterday',
    approvedSnippet: 'Vendor asked whether to hold the migration slot by Wednesday.',
  },
];

const baseCandidates: DecisionTraceCandidate[] = [
  {
    id: 'cand_customer_date',
    name: 'Implementation date reply',
    className: 'reply_gap_decision_packet',
    status: 'selected',
    plainEnglishReason:
      'This has a fresh customer ask and a meeting tomorrow where the answer will be used.',
    sourceIds: ['src_customer_thread', 'src_calendar_planning'],
  },
  {
    id: 'cand_generic_cleanup',
    name: 'General inbox cleanup',
    className: 'generic_follow_up',
    status: 'rejected',
    plainEnglishReason:
      'It is generic and does not produce a finished source-backed move.',
    sourceIds: ['src_customer_thread'],
  },
  {
    id: 'cand_old_vendor',
    name: 'Old vendor renewal watch',
    className: 'stale_source_poor_candidate',
    status: 'blocked',
    plainEnglishReason:
      'It is weaker than the customer reply because the source is older and the outcome is less clear.',
    sourceIds: ['src_vendor_note'],
  },
];

function goodTrace(overrides: Partial<DecisionTrace> = {}): DecisionTrace {
  return {
    sourcesRead: baseSources,
    sourceFreshnessSummary:
      'Customer email is fresh today, planning calendar is tomorrow, and vendor note is older.',
    candidates: baseCandidates,
    winner: {
      candidateId: 'cand_customer_date',
      name: 'Implementation date reply',
      whyThisWon:
        'The customer date reply won because Maya asked for the implementation date and the planning meeting needs that answer.',
      whyNow:
        'The planning meeting is tomorrow, so waiting would leave the team without the date.',
      evidenceSourceIds: ['src_customer_thread', 'src_calendar_planning'],
      proposedFinishedMove:
        'Subject: Implementation date for Thursday planning. Body: Maya, use May 22 as the implementation date for tomorrow planning.',
      approvalState:
        'Safe approval state: save or approve the draft; outbound send remains off unless explicitly enabled.',
    },
    noSafeMoveReason: undefined,
    sendNothingWhen: [
      'Send nothing when no fresh source-backed deadline, reply gap, decision, or document gap is strong enough.',
    ],
    userSafeSummary:
      'Foldera read the customer thread, calendar hold, and vendor note; selected the customer date reply; rejected generic cleanup and weaker vendor watch.',
    ...overrides,
  };
}

function noSafeMoveTrace(): DecisionTrace {
  return {
    sourcesRead: [
      {
        id: 'src_newsletters',
        label: 'Inbox newsletters',
        freshness: 'Fresh today',
        approvedSnippet: 'Several newsletters arrived with no direct ask or deadline.',
      },
      {
        id: 'src_empty_calendar',
        label: 'Calendar',
        freshness: 'Today',
        approvedSnippet: 'No meetings or deadline-bearing holds appear today.',
      },
    ],
    sourceFreshnessSummary:
      'Inbox and calendar are fresh, but neither contains a source-backed ask, deadline, reply gap, or stale document.',
    candidates: [
      {
        id: 'cand_newsletter_reply',
        name: 'Newsletter reply',
        className: 'generic_candidate',
        status: 'rejected',
        plainEnglishReason:
          'Rejected because replying would invent urgency from newsletters.',
        sourceIds: ['src_newsletters'],
      },
      {
        id: 'cand_calendar_nudge',
        name: 'Calendar nudge',
        className: 'source_poor_candidate',
        status: 'blocked',
        plainEnglishReason:
          'Blocked because the calendar has no meeting or decision to act on today.',
        sourceIds: ['src_empty_calendar'],
      },
    ],
    winner: null,
    noSafeMoveReason:
      'No safe move: nothing is strong enough to send, save, or ask approval for today.',
    sendNothingWhen: [
      'Send nothing when the only candidates are generic, stale, source-poor, or unsupported.',
    ],
    userSafeSummary:
      'Foldera read fresh sources, considered two candidates, rejected both, and will wait for a real source-backed move.',
  };
}

export const DECISION_TRACE_GATE_FIXTURES: DecisionTraceFixture[] = [
  {
    id: 'good_no_safe_move',
    expected: 'PASS',
    title: 'No safe move explains why Foldera sends nothing',
    trace: noSafeMoveTrace(),
  },
  {
    id: 'good_one_source_backed_move',
    expected: 'PASS',
    title: 'One source-backed move with visible decision trace',
    trace: goodTrace(),
  },
  {
    id: 'good_rejected_generic_candidate',
    expected: 'PASS',
    title: 'Generic candidate is rejected in plain English',
    trace: goodTrace({
      userSafeSummary:
        'Foldera selected the implementation date reply and explicitly rejected the general inbox cleanup because it was generic.',
    }),
  },
  {
    id: 'good_rejected_stale_source_poor_candidate',
    expected: 'PASS',
    title: 'Stale/source-poor candidate is blocked in plain English',
    trace: goodTrace({
      sourceFreshnessSummary:
        'Customer email is fresh today; vendor note is older and weaker; stale/source-poor candidates do not win.',
    }),
  },
  {
    id: 'good_selected_deadline_reply_gap_decision_packet',
    expected: 'PASS',
    title: 'Selected deadline/reply-gap decision packet',
    trace: goodTrace({
      winner: {
        candidateId: 'cand_customer_date',
        name: 'Deadline reply-gap decision packet',
        whyThisWon:
          'The deadline reply-gap packet won because Maya asked for the implementation date and tomorrow planning depends on it.',
        whyNow:
          'The answer is needed before tomorrow morning planning, so this is timely now.',
        evidenceSourceIds: ['src_customer_thread', 'src_calendar_planning'],
        proposedFinishedMove:
          'Decision packet: use May 22 as the implementation date; approve the exact customer reply or save it for the planning meeting.',
        approvalState:
          'Safe approval/save/skip state: user can approve, save, or skip; no outbound email is sent by this gate.',
      },
    }),
  },
  {
    id: 'bad_artifact_without_candidate_explanation',
    expected: 'FAIL',
    title: 'Artifact appears with no candidate explanation',
    trace: goodTrace({
      candidates: [],
    }),
  },
  {
    id: 'bad_because_ai_chose_it',
    expected: 'FAIL',
    title: 'Magic AI explanation',
    trace: goodTrace({
      winner: {
        ...goodTrace().winner!,
        whyThisWon: 'This won because AI chose it.',
      },
    }),
  },
  {
    id: 'bad_source_trail_does_not_support_winner',
    expected: 'FAIL',
    title: 'Source trail does not support winner',
    trace: goodTrace({
      sourcesRead: [
        {
          id: 'src_weather',
          label: 'Weather note',
          freshness: 'Fresh today',
          approvedSnippet: 'Tomorrow may be rainy.',
        },
      ],
      candidates: [
        {
          ...baseCandidates[0],
          sourceIds: ['src_weather'],
        },
        {
          ...baseCandidates[1],
          sourceIds: ['src_weather'],
        },
      ],
      winner: {
        ...goodTrace().winner!,
        evidenceSourceIds: ['src_weather'],
      },
    }),
  },
  {
    id: 'bad_rejected_candidates_hidden',
    expected: 'FAIL',
    title: 'Rejected candidates hidden',
    trace: goodTrace({
      candidates: [baseCandidates[0]],
    }),
  },
  {
    id: 'bad_no_why_now',
    expected: 'FAIL',
    title: 'No why-now reason',
    trace: goodTrace({
      winner: {
        ...goodTrace().winner!,
        whyNow: '',
      },
    }),
  },
  {
    id: 'bad_raw_internal_scoring_terms',
    expected: 'FAIL',
    title: 'Raw internal scoring terms shown',
    trace: goodTrace({
      userSafeSummary:
        'Debug json says raw_score vector passed the internal rubric for this winner.',
    }),
  },
  {
    id: 'bad_confidence_percentage_visible',
    expected: 'FAIL',
    title: 'Confidence percentage shown to user',
    trace: goodTrace({
      userSafeSummary:
        'Foldera is 87% confidence this reply-gap packet is the best move.',
    }),
  },
  {
    id: 'bad_private_owner_context_leaked',
    expected: 'FAIL',
    title: 'Private owner context leaked into public/demo trace',
    trace: goodTrace({
      userSafeSummary:
        'Brandon WorkSourceWA unemployment benefits context explains why this won.',
    }),
  },
];

export function buildDecisionTraceGateReport(input: {
  releaseGate?: ReleaseGateSummary;
  qualityGate?: QualityGateSummary;
  visualGate?: VisualGateSummary;
  fixtures?: DecisionTraceFixture[];
}): DecisionTraceGateReport {
  const releaseGate = input.releaseGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as ReleaseGateStatus | 'UNKNOWN',
    reason: 'Release gate status unavailable.',
  };
  const qualityGate = input.qualityGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as const,
    reason: 'Quality gate status unavailable.',
  };
  const visualGate = input.visualGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as const,
    reason: 'Visual gate status unavailable.',
  };
  const fixtures = input.fixtures ?? DECISION_TRACE_GATE_FIXTURES;
  const fixtureResults = fixtures.map((fixture) => ({
    fixture,
    result: evaluateDecisionTrace(fixture),
  }));
  const badAllowed = fixtureResults.filter(
    ({ fixture, result }) => fixture.expected === 'FAIL' && result.passes,
  );
  const goodRejected = fixtureResults.filter(
    ({ fixture, result }) => fixture.expected === 'PASS' && !result.passes,
  );
  const proofFound: string[] = [];
  const proofMissing: string[] = [];

  if (qualityGate.gate !== 'QG_10_ARTIFACT_QUALITY' || qualityGate.status !== 'PASS') {
    proofMissing.push('QG_10_ARTIFACT_QUALITY must pass before QG_13 can be current.');
  } else {
    proofFound.push('QG_10_ARTIFACT_QUALITY is PASS before decision trace quality is evaluated.');
  }

  if (visualGate.gate !== 'QG_11_VISUAL_FRONTEND_QUALITY' || visualGate.status !== 'PASS') {
    proofMissing.push('QG_11_VISUAL_FRONTEND_QUALITY must pass before QG_13 can be current.');
  } else {
    proofFound.push('QG_11_VISUAL_FRONTEND_QUALITY is PASS before decision trace quality is evaluated.');
  }

  if (fixtures.length === 0) proofMissing.push('QG_13 has no executable fixtures.');

  const badCount = fixtureResults.filter(({ fixture }) => fixture.expected === 'FAIL').length;
  const goodCount = fixtureResults.filter(({ fixture }) => fixture.expected === 'PASS').length;

  if (badCount > 0 && badAllowed.length === 0) {
    proofFound.push(`${badCount} bad decision trace fixtures rejected.`);
  } else {
    proofMissing.push(
      `Bad decision trace fixtures allowed: ${badAllowed.map(({ fixture }) => fixture.id).join(', ') || 'none present'}.`,
    );
  }

  if (goodCount > 0 && goodRejected.length === 0) {
    proofFound.push(`${goodCount} good decision trace fixtures accepted.`);
  } else {
    proofMissing.push(
      `Good decision trace fixtures rejected: ${goodRejected.map(({ fixture }) => fixture.id).join(', ') || 'none present'}.`,
    );
  }

  proofFound.push(
    'Decision trace proof is deterministic fixture evaluation only; no paid generation, outbound email, Stripe, schema, fake users, or owner-only proof required.',
  );

  const status: DecisionTraceGateStatus =
    proofMissing.length === 0
      ? 'PASS'
      : proofMissing.some((missing) => missing.includes('QG_10') || missing.includes('QG_11'))
        ? 'UNKNOWN'
        : 'FAIL';
  const decisionTraceGate: DecisionTraceGateResult = {
    id: QG_13_ID,
    status,
    reason:
      status === 'PASS'
        ? 'Good decision traces are inspectable and bad traces fail user-safe explanation checks.'
        : status === 'UNKNOWN'
          ? 'Decision trace gate cannot pass until prior quality and visual gates are passing.'
          : 'Executable decision trace proof is incomplete or contradictory.',
    nextMove:
      status === 'PASS'
        ? 'Keep QG_13 green; next move remains the external real non-owner beta blocker unless a new gate scope is assigned.'
        : 'Fix QG_13_DECISION_TRACE_QUALITY fixture/evaluator coverage only.',
    doNotTouch: DO_NOT_TOUCH,
  };

  return {
    releaseGate,
    qualityGate,
    visualGate,
    decisionTraceGate,
    firstFailingDecisionTraceGate: status === 'PASS' ? null : decisionTraceGate,
    proofFound,
    proofMissing,
    fixtureResults,
  };
}

export function formatDecisionTraceGateReport(report: DecisionTraceGateReport): string {
  const lines: string[] = [];
  lines.push(`RELEASE_GATE: ${report.releaseGate.gate} - ${report.releaseGate.status}`);
  lines.push(`RELEASE_GATE_REASON: ${report.releaseGate.reason}`);
  lines.push(`QUALITY_GATE: ${report.qualityGate.gate} - ${report.qualityGate.status}`);
  lines.push(`QUALITY_GATE_REASON: ${report.qualityGate.reason}`);
  lines.push(`VISUAL_GATE: ${report.visualGate.gate} - ${report.visualGate.status}`);
  lines.push(`VISUAL_GATE_REASON: ${report.visualGate.reason}`);
  lines.push(`DECISION_TRACE_GATE: ${report.decisionTraceGate.id}`);
  lines.push(
    `FIRST_FAILING_DECISION_TRACE_GATE: ${report.firstFailingDecisionTraceGate?.id ?? 'NONE'}`,
  );
  lines.push(`STATUS: ${report.decisionTraceGate.status}`);
  lines.push(`REASON: ${report.decisionTraceGate.reason}`);
  lines.push('PROOF_FOUND:');
  if (report.proofFound.length === 0) lines.push('- none');
  else report.proofFound.forEach((proof) => lines.push(`- ${proof}`));
  lines.push('PROOF_MISSING:');
  if (report.proofMissing.length === 0) lines.push('- none');
  else report.proofMissing.forEach((proof) => lines.push(`- ${proof}`));
  lines.push(`NEXT_MOVE: ${report.decisionTraceGate.nextMove}`);
  lines.push(`DO_NOT_TOUCH: ${report.decisionTraceGate.doNotTouch}`);
  lines.push('FIXTURE_RESULTS:');
  for (const { fixture, result } of report.fixtureResults) {
    lines.push(
      `- ${fixture.id}: ${result.passes ? 'PASS' : 'FAIL'}${result.reasons.length ? ` (${result.reasons.join(', ')})` : ''}`,
    );
  }
  return lines.join('\n');
}

async function readGateSummaries(): Promise<{
  releaseGate: ReleaseGateSummary;
  qualityGate: QualityGateSummary;
  visualGate: VisualGateSummary;
}> {
  const releaseReport = buildReleaseGateReport(await gatherReleaseGateEvidence());
  const releaseGate: ReleaseGateSummary = {
    gate: releaseReport.firstFailingGate.id,
    status: releaseReport.firstFailingGate.status,
    reason: releaseReport.firstFailingGate.reason,
  };
  const qualityReport = buildQualityGateReport({ releaseGate });
  const qualityGate: QualityGateSummary = {
    gate: qualityReport.qualityGate.id,
    status: qualityReport.qualityGate.status,
    reason: qualityReport.qualityGate.reason,
  };
  const visualReport = buildVisualGateReport({
    releaseGate,
    qualityGate,
    evidence: gatherVisualGateEvidence(),
  });
  const visualGate: VisualGateSummary = {
    gate: visualReport.visualGate.id,
    status: visualReport.visualGate.status,
    reason: visualReport.visualGate.reason,
  };
  return { releaseGate, qualityGate, visualGate };
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  readGateSummaries()
    .then(({ releaseGate, qualityGate, visualGate }) => {
      const report = buildDecisionTraceGateReport({
        releaseGate,
        qualityGate,
        visualGate,
      });
      console.log(formatDecisionTraceGateReport(report));
      process.exit(report.decisionTraceGate.status === 'PASS' ? 0 : 1);
    })
    .catch((error: unknown) => {
      console.error(
        `[decision-trace-gate-status] fatal: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}
