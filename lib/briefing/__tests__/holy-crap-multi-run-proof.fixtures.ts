import {
  applyRankingInvariants,
  passesTop3RankingInvariants,
  type ScoredLoop,
} from '@/lib/briefing/scorer';
import { getDecisionEnforcementIssues, selectFinalWinner } from '@/lib/briefing/generator';
import { getArtifactPersistenceIssues } from '@/lib/conviction/artifact-generator';

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.72,
  tractability: 0.78,
  freshness: 0.92,
  actionTypeRate: 0.68,
  entityPenalty: 0,
};

const GOAL = { text: 'Land critical approval before quarter close', priority: 1, category: 'career' } as const;

type CaseCandidate = Partial<ScoredLoop> & {
  id: string;
  score: number;
  title: string;
  content: string;
};

export interface Fixture {
  id: string;
  candidates: CaseCandidate[];
}

export interface RunResult {
  id: string;
  beforeTop3: ScoredLoop[];
  afterTop3: ScoredLoop[];
  winner: ScoredLoop;
  artifact: Record<string, unknown>;
  artifactType: 'send_message' | 'write_document';
  persistedCleanly: boolean;
  sendDecisionValid: boolean;
  actionableTop3: boolean;
  discrepancyOrOutcomeMoving: boolean;
  nonGenericWinner: boolean;
  nonObviousWinner: boolean;
  directlyApprovable: boolean;
  finishedWork: boolean;
  likelyNovel: boolean;
  judgment: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
  why: string;
}

const NO_GUARDRAILS = { approvedRecently: [], skippedRecently: [] };

function makeCandidate(input: CaseCandidate): ScoredLoop {
  return {
    id: input.id,
    type: input.type ?? 'signal',
    title: input.title,
    content: input.content,
    suggestedActionType: input.suggestedActionType ?? 'send_message',
    matchedGoal: input.matchedGoal ?? GOAL,
    score: input.score,
    breakdown: input.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: input.relatedSignals ?? [
      'Outcome risk increased in latest thread.',
      'Named stakeholder and date appear in source signal.',
    ],
    sourceSignals: input.sourceSignals ?? [
      {
        kind: 'signal',
        summary: 'Named stakeholder and date appear in source signal.',
        occurredAt: new Date().toISOString(),
      },
    ],
    confidence_prior: input.confidence_prior ?? 74,
    relationshipContext: input.relationshipContext,
    lifecycle: input.lifecycle,
  };
}

function renderArtifactFromWinner(winner: ScoredLoop): { artifactType: 'send_message' | 'write_document'; artifact: Record<string, unknown> } {
  if (winner.suggestedActionType === 'send_message') {
    const text = `${winner.title} ${winner.content}`;
    const email = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? 'ops@contoso.org';
    return {
      artifactType: 'send_message',
      artifact: {
        type: 'email',
        to: email,
        subject: `Decision needed today: ${winner.title.slice(0, 78)}`,
        body: `Can you confirm by 4 PM PT today which decision path we should take and who owns delivery? If we miss this cutoff, ${winner.content.slice(0, 110).toLowerCase()} and the timeline slips.`,
      },
    };
  }

  return {
    artifactType: 'write_document',
    artifact: {
      type: 'document',
      title: `Decision Memo: ${winner.title.slice(0, 88)}`,
      content: [
        `Decision required: ${winner.content}`,
        'Ask: confirm the selected path and accountable owner by 4 PM PT today.',
        'Consequence if delayed: approval dependency remains blocked and schedule risk increases.',
      ].join('\n\n'),
    },
  };
}

export function evaluateRun(fixture: Fixture): RunResult {
  const scored = fixture.candidates.map(makeCandidate);
  const beforeTop3 = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);

  const ranked = applyRankingInvariants(scored).ranked;
  const afterTop3 = ranked.filter((candidate) => candidate.score > 0).slice(0, 3);
  if (afterTop3.length === 0) {
    throw new Error(`${fixture.id}: ranking invariants removed all candidates`);
  }

  const { winner } = selectFinalWinner(afterTop3, NO_GUARDRAILS);
  const { artifact, artifactType } = renderArtifactFromWinner(winner);
  const artifactIssues = getArtifactPersistenceIssues(artifactType, artifact);
  const decisionLeverageIssues = getDecisionEnforcementIssues({
    actionType: artifactType,
    directiveText: winner.title,
    reason: winner.content,
    artifact,
  });

  const obviousPattern = /^(?:follow\s+up|check\s+in|touch\s+base|circle\s+back|review\s+calendar|organize\s+)/i;
  const actionableTop3 = afterTop3.length === 3 && afterTop3.every((candidate) => passesTop3RankingInvariants(candidate));
  const discrepancyOrOutcomeMoving = winner.type === 'discrepancy'
    || (winner.type === 'commitment' && (winner.breakdown.stakes ?? 0) >= 3 && (winner.breakdown.urgency ?? 0) >= 0.6);
  const nonGenericWinner = !obviousPattern.test(`${winner.title} ${winner.content}`);
  const nonObviousWinner = !obviousPattern.test(winner.title);
  const persistedCleanly = artifactIssues.length === 0;
  const directlyApprovable = persistedCleanly && decisionLeverageIssues.length === 0;
  const finishedWork = persistedCleanly && decisionLeverageIssues.length === 0;
  const likelyNovel = winner.type === 'discrepancy' || (winner.relatedSignals?.length ?? 0) >= 2;
  const sendDecisionValid = artifactType === 'send_message'
    ? typeof artifact.to === 'string' && artifact.to.includes('@')
    : true;

  const hardFailReasons: string[] = [];
  if (!persistedCleanly) hardFailReasons.push('artifact_invalid_for_persistence');
  if (decisionLeverageIssues.length > 0) hardFailReasons.push(`decision_enforcement_failed:${decisionLeverageIssues.join(',')}`);
  if (!nonGenericWinner || !nonObviousWinner) hardFailReasons.push('obvious_or_generic_winner');

  const softFailReasons: string[] = [];
  if (!actionableTop3) softFailReasons.push('top3_not_all_actionable');
  if (!discrepancyOrOutcomeMoving) softFailReasons.push('winner_not_outcome_moving');
  if (!likelyNovel) softFailReasons.push('winner_low_novelty');
  if (!sendDecisionValid) softFailReasons.push('invalid_send_decision');

  let judgment: RunResult['judgment'] = 'PASS';
  if (hardFailReasons.length > 0) judgment = 'HARD_FAIL';
  else if (softFailReasons.length > 0) judgment = 'SOFT_FAIL';

  const why = hardFailReasons.length > 0
    ? hardFailReasons.join(', ')
    : softFailReasons.length > 0
      ? softFailReasons.join(', ')
      : 'winner discrepancy-driven, top 3 actionable, artifact persisted cleanly';

  return {
    id: fixture.id,
    beforeTop3,
    afterTop3,
    winner,
    artifact,
    artifactType,
    persistedCleanly,
    sendDecisionValid,
    actionableTop3,
    discrepancyOrOutcomeMoving,
    nonGenericWinner,
    nonObviousWinner,
    directlyApprovable,
    finishedWork,
    likelyNovel,
    judgment,
    why,
  };
}

export const FIXTURES: Fixture[] = [
  {
    id: 'RUN 1',
    candidates: [
      {
        id: 'r1-drift',
        score: 4.1,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Hiring drift: references complete while offer decision slipped past competitor deadline',
        content: 'References finished Tuesday, but offer call moved after the competing-deadline date, risking forced choice.',
      },
      {
        id: 'r1-approval-risk',
        score: 3.8,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Approval asymmetry: legal response window closes before approver returns',
        content: 'Legal response requires sign-off by Friday noon while approver is unavailable until Monday morning.',
      },
      {
        id: 'r1-commitment',
        score: 3.7,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send escalation note to hiring manager at manager@acme.com by 2026-04-03',
        content: 'Escalation note must secure owner and date before competitor deadline expires.',
      },
      {
        id: 'r1-noise',
        score: 4.7,
        type: 'signal',
        title: 'Check in with recruiter',
        content: 'Check in with recruiter.',
      },
    ],
  },
  {
    id: 'RUN 2',
    candidates: [
      {
        id: 'r2-timing',
        score: 4.0,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Timing asymmetry: board vote moved up while dependency approvals remain unsigned',
        content: 'Board vote moved six days earlier and two prerequisite approvals are still unsigned.',
      },
      {
        id: 'r2-avoidance',
        score: 3.85,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Avoidance loop: same blocker acknowledged four times with no owner assignment',
        content: 'Thread history shows four acknowledgements of the same blocker and zero named owner.',
      },
      {
        id: 'r2-strong-task',
        score: 3.75,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send dependency waiver request to boardsecretary@org.org by Friday 5pm',
        content: 'Waiver request is required to keep board agenda slot after date acceleration.',
      },
      {
        id: 'r2-obvious',
        score: 4.6,
        type: 'commitment',
        title: 'Follow up with board team',
        content: 'Follow up with board team.',
      },
    ],
  },
  {
    id: 'RUN 3',
    candidates: [
      {
        id: 'r3-relationship-decay',
        score: 4.2,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Relationship decay: sponsor moved from weekly replies to 18-day silence before funding decision',
        content: 'Sponsor was responsive weekly, then stopped responding 18 days before funding committee vote.',
      },
      {
        id: 'r3-hidden-risk',
        score: 3.86,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Unseen risk: procurement flagged contract path as non-compliant after roadmap commitments were shared',
        content: 'Roadmap assumes direct award while procurement thread now requires rebid path and legal review.',
      },
      {
        id: 'r3-commitment',
        score: 3.74,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send sponsor re-alignment request to sponsor.office@city.gov by Thursday noon',
        content: 'Message needs explicit decision ask and scheduling anchor before committee packet freeze.',
      },
      {
        id: 'r3-noise',
        score: 4.65,
        type: 'signal',
        title: 'Touch base with sponsor',
        content: 'Touch base with sponsor.',
      },
    ],
  },
  {
    id: 'RUN 4',
    candidates: [
      {
        id: 'r4-avoidance',
        score: 4.18,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Repeated avoidance: reviewer keeps deferring the same approval without counter-proposal',
        content: 'Three deferrals in ten days occurred with no alternate proposal or owner handoff.',
      },
      {
        id: 'r4-goal-drift',
        score: 3.9,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Goal drift: runway target tightened while discretionary spend increased 22 percent',
        content: 'Cash target tightened this month while discretionary spend trend increased week over week.',
      },
      {
        id: 'r4-outcome-task',
        score: 3.76,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send revised approval packet owner list to approvals@partner.com by 2026-04-01',
        content: 'Revised owner list is required to prevent automatic rejection at intake.',
      },
      {
        id: 'r4-noise',
        score: 4.55,
        type: 'signal',
        title: 'Schedule a 30 minute planning block',
        content: 'Schedule a 30 minute planning block.',
      },
    ],
  },
  {
    id: 'RUN 5',
    candidates: [
      {
        id: 'r5-contradiction',
        score: 4.12,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Contradiction: launch date committed externally while critical security sign-off is still pending',
        content: 'External launch date is announced, but mandatory security sign-off remains unresolved in audit thread.',
      },
      {
        id: 'r5-relationship-risk',
        score: 3.92,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Relationship risk: repeated late updates reduced confidence from final approver',
        content: 'Approver explicitly called out confidence drop after repeated late updates and missing owners.',
      },
      {
        id: 'r5-strong-commitment',
        score: 3.8,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send security sign-off escalation to sec-approvals@product.io before 2026-04-04',
        content: 'Escalation must capture blocker owner, decision date, and release dependency impact.',
      },
      {
        id: 'r5-noise',
        score: 4.62,
        type: 'signal',
        title: 'Check status with team',
        content: 'Check status with team.',
      },
    ],
  },
  {
    id: 'RUN 6',
    candidates: [
      {
        id: 'r6-strong-commitment',
        score: 4.25,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send signed grant packet to panel@fund.gov by 2026-04-02 with compliance attachment',
        content: 'Funding eligibility expires at deadline and panel requested signed packet and compliance proof.',
        breakdown: { ...BASE_BREAKDOWN, stakes: 4.2, urgency: 0.82 },
      },
      {
        id: 'r6-risk-discrepancy',
        score: 4.02,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Timing risk: grant review moved earlier while attachment owner remains unconfirmed',
        content: 'Grant review moved earlier and required compliance attachment still has no assigned owner.',
      },
      {
        id: 'r6-avoidance',
        score: 3.82,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Avoidance pattern: compliance owner repeatedly acknowledged request without delivery date',
        content: 'Compliance owner acknowledged request three times and never committed to a delivery timestamp.',
      },
      {
        id: 'r6-noise',
        score: 4.58,
        type: 'signal',
        title: 'Review calendar',
        content: 'Review calendar for open slots.',
      },
    ],
  },
  {
    id: 'RUN 7',
    candidates: [
      {
        id: 'r7-hidden-risk',
        score: 4.06,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Hidden risk: final approval assumes reference cleared, but HR flagged supervisor requirement gap',
        content: 'HR flagged missing supervisor reference while approval packet already assumes reference complete.',
      },
      {
        id: 'r7-drift',
        score: 3.88,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Behavior drift: prep work increased while submission count dropped to zero near deadline',
        content: 'Preparation activity increased but no submissions were sent during final pre-deadline week.',
      },
      {
        id: 'r7-outcome-task',
        score: 3.74,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send HR reference mitigation note to recruiter@state.gov by tomorrow 11am',
        content: 'Mitigation note must secure acceptable alternate reference path before final review.',
      },
      {
        id: 'r7-noise',
        score: 4.54,
        type: 'signal',
        title: 'Follow up with recruiter',
        content: 'Follow up with recruiter.',
      },
    ],
  },
  {
    id: 'RUN 8',
    candidates: [
      {
        id: 'r8-contradiction',
        score: 4.04,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Contradiction: hiring plan assumes acceptance while relocation terms remain unresolved',
        content: 'Hiring plan locks start date even though relocation constraints are unresolved in latest thread.',
      },
      {
        id: 'r8-timing',
        score: 3.87,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Timing asymmetry: start-date announcement precedes formal approvals by one week',
        content: 'Start date was announced publicly before the required internal approvals completed.',
      },
      {
        id: 'r8-task',
        score: 3.73,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send relocation decision request to talentlead@startup.com by Friday noon',
        content: 'Decision request must anchor relocation constraints against announced start date.',
      },
      {
        id: 'r8-noise',
        score: 4.6,
        type: 'signal',
        title: 'Check in with candidate',
        content: 'Check in with candidate.',
      },
    ],
  },
  {
    id: 'RUN 9',
    candidates: [
      {
        id: 'r9-deadline-risk',
        score: 4.08,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Deadline risk: permit hearing moved sooner while evidence packet is incomplete',
        content: 'Permit hearing date moved forward and evidence packet still lacks two required exhibits.',
      },
      {
        id: 'r9-avoidance',
        score: 3.9,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Avoidance pattern: legal review repeatedly deferred without replacement owner',
        content: 'Legal review was deferred three times and no replacement owner was assigned.',
      },
      {
        id: 'r9-commitment',
        score: 3.78,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send exhibit ownership escalation to permit.board@county.gov by 2026-04-02',
        content: 'Escalation must lock exhibit owners and completion dates before hearing cutoff.',
      },
      {
        id: 'r9-noise',
        score: 4.57,
        type: 'signal',
        title: 'Organize permit notes',
        content: 'Organize permit notes.',
      },
    ],
  },
  {
    id: 'RUN 10',
    candidates: [
      {
        id: 'r10-relationship-risk',
        score: 4.14,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Relationship risk: repeated late reversals eroded trust with final decision owner',
        content: 'Decision owner flagged trust erosion after three late reversals and missing confirmation dates.',
      },
      {
        id: 'r10-unseen-risk',
        score: 3.93,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Unseen risk: payment approval assumes signed terms that procurement still disputes',
        content: 'Payment approval path assumes signed terms while procurement dispute remains unresolved.',
      },
      {
        id: 'r10-outcome-task',
        score: 3.76,
        type: 'commitment',
        suggestedActionType: 'send_message',
        title: 'Send trust-repair decision request to owner.office@partner.org by Thursday 3pm',
        content: 'Request should lock one decision path and confirm accountable owner before meeting.',
      },
      {
        id: 'r10-noise',
        score: 4.66,
        type: 'signal',
        title: 'Follow up with owner',
        content: 'Follow up with owner.',
      },
    ],
  },
];
