import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  buildReleaseGateReport,
  gatherReleaseGateEvidence,
  type ReleaseGateStatus,
} from './release-gate-status';

export type QualityGateStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface ReleaseGateSummary {
  gate: string;
  status: ReleaseGateStatus | 'UNKNOWN';
  reason: string;
}

export interface QualityArtifactFixture {
  id: string;
  expected: 'PASS' | 'FAIL';
  title: string;
  artifact: string;
  sourceFacts?: string[];
}

export interface QualityArtifactEvaluation {
  passes: boolean;
  reasons: string[];
}

export interface QualityGateResult {
  id: 'QG_10_ARTIFACT_QUALITY';
  status: QualityGateStatus;
  reason: string;
  nextMove: string;
  doNotTouch: string;
}

export interface QualityGateReport {
  releaseGate: ReleaseGateSummary;
  qualityGate: QualityGateResult;
  firstFailingQualityGate: QualityGateResult | null;
  proofFound: string[];
  proofMissing: string[];
  fixtureResults: Array<{
    fixture: QualityArtifactFixture;
    result: QualityArtifactEvaluation;
  }>;
}

const DO_NOT_TOUCH =
  'UI polish, Stripe, paid generation, fake users, owner-only proof, pricing.';

const GENERIC_COACHING_PATTERN =
  /\b(here are some things to consider|things to consider|generic coaching|tips|best practice|generally|in general|star framework|prep checklist|questions to ask|review (?:the )?(?:website|job description)|prepare examples|practice questions|consider|think about|reflect on)\b/i;

const REMINDER_ONLY_PATTERN =
  /\b(?:reminder:|(?:interview|meeting|event)\s+(?:is\s+)?(?:tomorrow|today|coming up))\b[\s\S]{0,140}\b(?:prepare accordingly|remember to|don't forget|review your notes)\b/i;

const SUMMARY_ONLY_PATTERN =
  /\b(summary|summarize|recap|overview|inbox contains|calendar contains|only restates)\b/i;

const SOURCE_LABEL_PATTERN =
  /\b(source|source email|source trail|evidence|calendar source|thread|document source|meeting source)\b/i;

const WHY_NOW_PATTERN =
  /\b(why now|this matters now|deadline|by \w+day|by \d{1,2}|today|tomorrow|stale|gap|risk|window closes|waiting because|no safe move|before|after|meeting|expires|renewal window)\b/i;

const NEXT_MOVE_PATTERN =
  /\b(next action|next move|send|reply|approve|save|skip|decide|choose|submit|ask|request|confirm|decline|resolve|use this|copy\/paste|no safe move|wait until|reopen when)\b/i;

const ACTION_READY_PATTERN =
  /\b(final recommendation|draft|subject:|body:|exact message|use this|copy\/paste|as-is|approval-ready|packet|next action|decision:|no safe move|finished answer|source-backed follow-up)\b/i;

const VAGUE_FOLLOW_UP_PATTERN =
  /\b(follow up|check in|touch base|circle back|see where things stand)\b/i;

const FAKE_URGENCY_PATTERN =
  /\b(urgent|asap|immediately|critical|must act now|emergency)\b/i;

const FAKE_OBLIGATION_PATTERN =
  /\b(owe|owes|obligated|must respond|must send|have to respond|relationship pressure|professional pressure)\b/i;

const RELATIONSHIP_PRESSURE_PATTERN =
  /\b(relationship (?:risk|pressure|closure)|silence means|moved on|professional relationship is at risk)\b/i;

const PREP_INSTEAD_OF_WORK_PATTERN =
  /\b(prepare|review|research|practice|consider)\b/i;

const FINISHED_WORK_ESCAPE_PATTERN =
  /\b(subject:|body:|exact message|final recommendation|next action|use this|copy\/paste|draft|finished answer)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceAnchored(artifact: string, sourceFacts: string[]): boolean {
  if (sourceFacts.length === 0) return false;
  const normalizedArtifact = normalize(artifact);
  return sourceFacts.some((fact) => {
    const tokens = normalize(fact)
      .split(/\s+/)
      .filter((token) => token.length >= 5 && !['source', 'email', 'calendar', 'thread'].includes(token));
    if (tokens.length === 0) return false;
    return tokens.some((token) => normalizedArtifact.includes(token));
  });
}

function isOnlyRestatement(text: string): boolean {
  return SUMMARY_ONLY_PATTERN.test(text) && !NEXT_MOVE_PATTERN.test(text) && !ACTION_READY_PATTERN.test(text);
}

export function evaluateQG10Artifact(fixture: QualityArtifactFixture): QualityArtifactEvaluation {
  const artifact = fixture.artifact.trim();
  const sourceFacts = fixture.sourceFacts ?? [];
  const reasons: string[] = [];
  const hasSources = sourceAnchored(artifact, sourceFacts) && SOURCE_LABEL_PATTERN.test(artifact);
  const hasWhyNow = WHY_NOW_PATTERN.test(artifact);
  const hasNextMove = NEXT_MOVE_PATTERN.test(artifact);
  const actionReady = ACTION_READY_PATTERN.test(artifact);

  if (!hasSources) reasons.push('missing_specific_source_backed_context');
  if (!hasWhyNow) reasons.push('missing_real_reason_this_matters_now');
  if (!hasNextMove) reasons.push('missing_concrete_next_move');
  if (!actionReady) reasons.push('not_action_ready_finished_work');
  if (GENERIC_COACHING_PATTERN.test(artifact)) reasons.push('generic_coaching');
  if (REMINDER_ONLY_PATTERN.test(artifact)) reasons.push('reminder_only');
  if (isOnlyRestatement(artifact)) reasons.push('summary_only_or_restatement');
  if (VAGUE_FOLLOW_UP_PATTERN.test(artifact) && !/\b(ask for|confirm|send|reply with|by \w+day|today|tomorrow)\b/i.test(artifact)) {
    reasons.push('vague_follow_up');
  }
  if (FAKE_URGENCY_PATTERN.test(artifact) && !/\b(source|deadline|expires|window closes|by \w+day|by \d{1,2})\b/i.test(artifact)) {
    reasons.push('fake_urgency');
  }
  if (FAKE_OBLIGATION_PATTERN.test(artifact) && !/\b(source|asked|requested|required by|deadline)\b/i.test(artifact)) {
    reasons.push('fake_obligation');
  }
  if (RELATIONSHIP_PRESSURE_PATTERN.test(artifact)) reasons.push('fake_relationship_pressure');
  if (PREP_INSTEAD_OF_WORK_PATTERN.test(artifact) && !FINISHED_WORK_ESCAPE_PATTERN.test(artifact)) {
    reasons.push('tells_user_what_to_do_instead_of_delivering_work');
  }

  return {
    passes: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export const QUALITY_GATE_FIXTURES: QualityArtifactFixture[] = [
  {
    id: 'bad_generic_prep_checklist',
    expected: 'FAIL',
    title: 'Generic prep checklist',
    artifact: 'Source Email: recruiter scheduled an interview. Prep checklist: review the website, prepare examples, practice questions, and think about what to wear.',
    sourceFacts: ['Source Email: recruiter scheduled an interview.'],
  },
  {
    id: 'bad_generic_coaching',
    expected: 'FAIL',
    title: 'Generic coaching',
    artifact: 'Here are some things to consider before the meeting. Generally, be prepared, stay positive, and review the job description.',
    sourceFacts: ['Calendar source: meeting tomorrow.'],
  },
  {
    id: 'bad_reminder_only',
    expected: 'FAIL',
    title: 'Reminder only',
    artifact: 'Source: calendar. Reminder: the vendor meeting is tomorrow. Remember to review your notes.',
    sourceFacts: ['Calendar source: vendor meeting tomorrow.'],
  },
  {
    id: 'bad_summary_only',
    expected: 'FAIL',
    title: 'Summary only',
    artifact: 'Source Email: customer sent three messages. Summary: the inbox contains a customer update, a vendor note, and one calendar hold.',
    sourceFacts: ['Source Email: customer sent three messages.'],
  },
  {
    id: 'bad_source_free_advice',
    expected: 'FAIL',
    title: 'Source-free advice',
    artifact: 'You should reach out soon. It may help to clarify expectations and keep momentum.',
  },
  {
    id: 'bad_vague_follow_up',
    expected: 'FAIL',
    title: 'Vague follow-up',
    artifact: 'Source Email: Alex last replied about the project. Follow up with Alex and see where things stand.',
    sourceFacts: ['Source Email: Alex last replied about the project.'],
  },
  {
    id: 'bad_fake_urgency',
    expected: 'FAIL',
    title: 'Fake urgency',
    artifact: 'Source Email: newsletter arrived. This is urgent and must act now. Next action: reply immediately.',
    sourceFacts: ['Source Email: newsletter arrived.'],
  },
  {
    id: 'bad_fake_obligation',
    expected: 'FAIL',
    title: 'Fake obligation',
    artifact: 'Source Email: system notification was silent. You are obligated to respond and must send a decision today.',
    sourceFacts: ['Source Email: system notification was silent.'],
  },
  {
    id: 'bad_relationship_pressure',
    expected: 'FAIL',
    title: 'Fake relationship pressure',
    artifact: 'Source Email: onboarding@vendor.example has not replied. Decision: relationship closure may be needed because professional relationship is at risk. Next action: move on today.',
    sourceFacts: ['Source Email: onboarding@vendor.example has not replied.'],
  },
  {
    id: 'bad_no_concrete_next_move',
    expected: 'FAIL',
    title: 'No concrete next move',
    artifact: 'Source Email: vendor renewal thread. This matters now because the renewal window is open. The situation has risk and should be watched.',
    sourceFacts: ['Source Email: vendor renewal thread.'],
  },
  {
    id: 'bad_requires_brandon_narration',
    expected: 'FAIL',
    title: 'Requires Brandon narration',
    artifact: 'Source Email: customer asked about timeline. The thread contains useful context and may matter to the account.',
    sourceFacts: ['Source Email: customer asked about timeline.'],
  },
  {
    id: 'bad_restates_inbox_calendar',
    expected: 'FAIL',
    title: 'Only restates inbox and calendar',
    artifact: 'Source Email: customer note. Calendar source: Tuesday meeting. Overview: one email arrived and one calendar event exists.',
    sourceFacts: ['Source Email: customer note.', 'Calendar source: Tuesday meeting.'],
  },
  {
    id: 'bad_tells_user_to_do_work',
    expected: 'FAIL',
    title: 'Tells user what to do',
    artifact: 'Source Email: hiring packet arrived today. Review the packet, research the company, and prepare a response.',
    sourceFacts: ['Source Email: hiring packet arrived today.'],
  },
  {
    id: 'good_deadline_decision_packet',
    expected: 'PASS',
    title: 'Deadline decision packet with source evidence',
    artifact: [
      'Source Email: vendor renewal request says pricing locks Friday.',
      'Why now: the renewal window closes Friday and the calendar has a budget review before then.',
      'FINAL RECOMMENDATION: approve the one-year renewal only if the vendor accepts the current price.',
      'Decision: choose renewal at current price; decline if price changes.',
      'NEXT ACTION: send the approval condition today.',
      'Source trail: vendor renewal email plus budget-review calendar hold.',
    ].join('\n'),
    sourceFacts: ['Source Email: vendor renewal request says pricing locks Friday.'],
  },
  {
    id: 'good_source_backed_follow_up_draft',
    expected: 'PASS',
    title: 'Source-backed follow-up draft',
    artifact: [
      'Source Email: customer asked for the implementation date and has a Thursday planning meeting.',
      'Why now: the Thursday planning meeting needs the date before it starts.',
      'Subject: Implementation date for Thursday planning',
      'Body: Hi Maya, the implementation date we can commit to is May 22. Please use that date in the Thursday planning meeting, and tell me today if procurement needs a different format.',
      'NEXT ACTION: approve this draft or edit the date before sending.',
    ].join('\n'),
    sourceFacts: ['Source Email: customer asked for the implementation date and has a Thursday planning meeting.'],
  },
  {
    id: 'good_meeting_prep_with_source_gaps',
    expected: 'PASS',
    title: 'Meeting prep with specific source gaps',
    artifact: [
      'Source trail: calendar says Acme renewal meeting is tomorrow; inbox has no pricing reply from Dana.',
      'Why now: the meeting starts tomorrow, and the missing pricing reply is the only gap that changes the recommendation.',
      'Decision: enter the meeting with renewal approved at current price and hold any upsell until Dana replies.',
      'NEXT ACTION: ask Dana for the pricing reply before 3 PM today.',
      'Exact message: Dana, can you confirm whether the renewal price changed before tomorrow morning?',
    ].join('\n'),
    sourceFacts: ['Calendar source: Acme renewal meeting is tomorrow.', 'Source Email: no pricing reply from Dana.'],
  },
  {
    id: 'good_vendor_next_step_draft',
    expected: 'PASS',
    title: 'Vendor/customer next-step draft',
    artifact: [
      'Source Email: vendor asked whether to hold the migration slot by Wednesday.',
      'Why now: the migration slot expires Wednesday and the customer kickoff depends on it.',
      'Subject: Hold the Wednesday migration slot',
      'Body: Please hold the Wednesday migration slot. We are approving it because the customer kickoff depends on that date. If the slot changes, reply today with the nearest available replacement.',
      'NEXT ACTION: approve this draft to reserve the slot.',
    ].join('\n'),
    sourceFacts: ['Source Email: vendor asked whether to hold the migration slot by Wednesday.'],
  },
  {
    id: 'good_stale_document_follow_up',
    expected: 'PASS',
    title: 'Stale document follow-up with evidence',
    artifact: [
      'Document source: contract draft was last edited 12 days ago; source email asks for final language before Friday.',
      'Why now: the Friday deadline will pass with the draft still stale unless ownership is confirmed today.',
      'Subject: Final contract language before Friday',
      'Body: The contract draft has not changed in 12 days, and the final language is due Friday. Please confirm today whether I should use the current draft as final or wait for your edits.',
      'NEXT ACTION: send the draft to the document owner today.',
    ].join('\n'),
    sourceFacts: ['Document source: contract draft was last edited 12 days ago.', 'Source Email: final language due Friday.'],
  },
  {
    id: 'good_no_safe_move',
    expected: 'PASS',
    title: 'Clear no-safe-move explanation',
    artifact: [
      'Source trail: inbox has unrelated newsletters; calendar has no meetings today; document source has no stale owner-facing draft.',
      'Why now: no source-backed deadline, reply gap, risk, or document gap exists today.',
      'No safe move: sending a reminder would invent urgency.',
      'NEXT ACTION: wait until a real source-backed deadline, reply gap, meeting, or stale document appears.',
    ].join('\n'),
    sourceFacts: ['Source trail: inbox has unrelated newsletters; calendar has no meetings today.'],
  },
  {
    id: 'good_approval_ready_document',
    expected: 'PASS',
    title: 'Approval-ready document',
    artifact: [
      'Source Email: customer escalated the missing launch checklist and asked for a same-day answer.',
      'Why now: the launch review is today, and the missing checklist blocks go/no-go.',
      'Approval-ready packet: what happened - the checklist was requested but never attached; why now - launch review is today; decision - send the missing checklist request before the review.',
      'Exact message: Please send the launch checklist before today\'s review so the go/no-go call is not blocked.',
      'NEXT ACTION: approve the message or save the packet for the launch review.',
      'Source trail: customer escalation email and launch-review calendar event.',
    ].join('\n'),
    sourceFacts: ['Source Email: customer escalated the missing launch checklist.', 'Calendar source: launch review is today.'],
  },
];

export function buildQualityGateReport(input: {
  releaseGate?: ReleaseGateSummary;
  fixtures?: QualityArtifactFixture[];
}): QualityGateReport {
  const releaseGate = input.releaseGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as const,
    reason: 'Release gate status unavailable.',
  };
  const fixtures = input.fixtures ?? QUALITY_GATE_FIXTURES;
  const fixtureResults = fixtures.map((fixture) => ({
    fixture,
    result: evaluateQG10Artifact(fixture),
  }));
  const badAllowed = fixtureResults.filter(
    ({ fixture, result }) => fixture.expected === 'FAIL' && result.passes,
  );
  const goodRejected = fixtureResults.filter(
    ({ fixture, result }) => fixture.expected === 'PASS' && !result.passes,
  );
  const proofFound: string[] = [];
  const proofMissing: string[] = [];

  if (fixtures.length === 0) {
    proofMissing.push('QG_10 has no executable fixtures.');
  }

  const badCount = fixtureResults.filter(({ fixture }) => fixture.expected === 'FAIL').length;
  const goodCount = fixtureResults.filter(({ fixture }) => fixture.expected === 'PASS').length;

  if (badCount > 0 && badAllowed.length === 0) {
    proofFound.push(`${badCount} bad artifact fixtures rejected.`);
  } else {
    proofMissing.push(
      `Bad artifact fixtures allowed: ${badAllowed.map(({ fixture }) => fixture.id).join(', ') || 'none present'}.`,
    );
  }

  if (goodCount > 0 && goodRejected.length === 0) {
    proofFound.push(`${goodCount} good artifact fixtures accepted.`);
  } else {
    proofMissing.push(
      `Good artifact fixtures rejected: ${goodRejected.map(({ fixture }) => fixture.id).join(', ') || 'none present'}.`,
    );
  }

  proofFound.push('Quality proof is deterministic fixture evaluation only; no paid generation, outbound email, Stripe, schema, fake users, or owner-only proof required.');

  const status: QualityGateStatus =
    proofMissing.length === 0 ? 'PASS' : fixtures.length === 0 ? 'UNKNOWN' : 'FAIL';
  const reason =
    status === 'PASS'
      ? 'Bad examples fail and good examples pass under executable QG_10 proof.'
      : 'QG_10 executable proof is incomplete or contradictory.';
  const qualityGate: QualityGateResult = {
    id: 'QG_10_ARTIFACT_QUALITY',
    status,
    reason,
    nextMove:
      status === 'PASS'
        ? 'Keep QG_10 green; do not start QG_11 or artifact improvements without a new quality-gate scope.'
        : 'Fix QG_10_ARTIFACT_QUALITY fixture classification only.',
    doNotTouch: DO_NOT_TOUCH,
  };

  return {
    releaseGate,
    qualityGate,
    firstFailingQualityGate: status === 'PASS' ? null : qualityGate,
    proofFound,
    proofMissing,
    fixtureResults,
  };
}

export function formatQualityGateReport(report: QualityGateReport): string {
  const lines: string[] = [];
  lines.push(`RELEASE_GATE: ${report.releaseGate.gate} - ${report.releaseGate.status}`);
  lines.push(`RELEASE_GATE_REASON: ${report.releaseGate.reason}`);
  lines.push(`QUALITY_GATE: ${report.qualityGate.id}`);
  lines.push(`FIRST_FAILING_QUALITY_GATE: ${report.firstFailingQualityGate?.id ?? 'NONE'}`);
  lines.push(`STATUS: ${report.qualityGate.status}`);
  lines.push(`REASON: ${report.qualityGate.reason}`);
  lines.push('PROOF_FOUND:');
  if (report.proofFound.length === 0) lines.push('- none');
  else report.proofFound.forEach((proof) => lines.push(`- ${proof}`));
  lines.push('PROOF_MISSING:');
  if (report.proofMissing.length === 0) lines.push('- none');
  else report.proofMissing.forEach((proof) => lines.push(`- ${proof}`));
  lines.push(`NEXT_MOVE: ${report.qualityGate.nextMove}`);
  lines.push(`DO_NOT_TOUCH: ${report.qualityGate.doNotTouch}`);
  lines.push('FIXTURE_RESULTS:');
  for (const { fixture, result } of report.fixtureResults) {
    lines.push(`- ${fixture.id}: ${result.passes ? 'PASS' : 'FAIL'}${result.reasons.length ? ` (${result.reasons.join(', ')})` : ''}`);
  }
  return lines.join('\n');
}

async function readReleaseGateSummary(): Promise<ReleaseGateSummary> {
  try {
    const releaseReport = buildReleaseGateReport(await gatherReleaseGateEvidence());
    return {
      gate: releaseReport.firstFailingGate.id,
      status: releaseReport.firstFailingGate.status,
      reason: releaseReport.firstFailingGate.reason,
    };
  } catch (error) {
    return {
      gate: 'UNKNOWN',
      status: 'UNKNOWN',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  readReleaseGateSummary()
    .then((releaseGate) => {
      const report = buildQualityGateReport({ releaseGate });
      console.log(formatQualityGateReport(report));
      process.exit(report.qualityGate.status === 'PASS' ? 0 : 1);
    })
    .catch((error: unknown) => {
      console.error(
        `[quality-gate-status] fatal: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}
