import { describe, expect, it } from 'vitest';
import { selectFinalWinner, selectRankedCandidates } from '../generator';
import type { ScoredLoop } from '../scorer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.6,
  tractability: 0.7,
  freshness: 0.8,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function makeCandidate(overrides: Partial<ScoredLoop> & { score: number }): ScoredLoop {
  return {
    id: overrides.id ?? 'cand-1',
    type: overrides.type ?? 'signal',
    title: overrides.title ?? 'Test candidate',
    content: overrides.content ?? 'Some content about the candidate.',
    suggestedActionType: overrides.suggestedActionType ?? 'write_document',
    matchedGoal: overrides.matchedGoal ?? null,
    score: overrides.score,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? [],
    sourceSignals: overrides.sourceSignals ?? [],
    ...overrides,
  };
}

const NO_GUARDRAILS = { approvedRecently: [], skippedRecently: [] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectFinalWinner', () => {
  it('single candidate always wins when viable', () => {
    const candidate = makeCandidate({ score: 2.0 });
    const result = selectFinalWinner([candidate], NO_GUARDRAILS);
    expect(result.winner).toBe(candidate);
    expect(result.competitionContext).toContain('Winner:');
  });

  it('disqualifies low-value hunt send_message and falls back to runner-up', () => {
    const junkHunt = makeCandidate({
      id: 'hunt-junk',
      type: 'hunt',
      score: 99,
      suggestedActionType: 'send_message',
      title: 'Inbound email unanswered 12+ days — Summer kickoff',
      content: 'HUNT_ANOMALY_FINDING\nKind: unreplied_inbound\nPhoto contest — submit today. Enter to win swag.',
    });
    const runner = makeCandidate({
      id: 'runner',
      score: 2.5,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      title: 'Permit review packet still unsigned',
    });
    const { winner } = selectFinalWinner([junkHunt, runner], NO_GUARDRAILS);
    expect(winner.id).toBe('runner');
  });

  it('marks single low-value hunt send_message as disqualified (no single-candidate bypass)', () => {
    const junkHunt = makeCandidate({
      id: 'solo-junk',
      type: 'hunt',
      score: 80,
      suggestedActionType: 'send_message',
      title: 'Inbound email unanswered — Flash sale today only',
      content: 'Limited-time offer — shop now and save 40%.',
    });
    const { ranked } = selectRankedCandidates([junkHunt], NO_GUARDRAILS);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].disqualified).toBe(true);
    expect(ranked[0].disqualifyReason).toBe('low_value_inbound_promotional_thread');
  });

  it('throws on empty candidate list', () => {
    expect(() => selectFinalWinner([], NO_GUARDRAILS)).toThrow('empty candidate list');
  });

  it('top scorer wins when both are equal viability', () => {
    const high = makeCandidate({ id: 'high', score: 3.0, title: 'High scorer' });
    const low = makeCandidate({ id: 'low', score: 1.5, title: 'Low scorer' });
    const { winner } = selectFinalWinner([high, low], NO_GUARDRAILS);
    expect(winner.id).toBe('high');
  });

  it('send_message without email in signals is downgraded vs runner-up with email', () => {
    const topNoEmail = makeCandidate({
      id: 'top',
      score: 3.0,
      title: 'Follow up on something',
      suggestedActionType: 'send_message',
      content: 'No email address here at all.',
    });
    const runnerUpWithEmail = makeCandidate({
      id: 'runner',
      score: 2.6,
      title: 'Respond to Alice',
      suggestedActionType: 'send_message',
      content: 'alice@permitsoffice.gov sent a message about the permit.',
    });

    const { winner } = selectFinalWinner([topNoEmail, runnerUpWithEmail], NO_GUARDRAILS);
    // topNoEmail: 3.0 * 0.80 = 2.40 — runner-up (2.6) beats it
    expect(winner.id).toBe('runner');
  });

  it('commitment type gets +12% viability bonus', () => {
    const commitment = makeCandidate({
      id: 'commit',
      score: 2.0,
      type: 'commitment',
      title: 'File permit appeal by Friday',
    });
    const plain = makeCandidate({
      id: 'plain',
      score: 2.1,
      type: 'signal',
      title: 'Generic follow-up',
    });

    // commitment: 2.0 * 1.12 = 2.24 > plain: 2.1
    const { winner } = selectFinalWinner([plain, commitment], NO_GUARDRAILS);
    expect(winner.id).toBe('commit');
  });

  it('already-acted-recently candidate is disqualified and falls back to runner-up', () => {
    const recentTitle = 'Send update to Bob about the contract';
    const stale = makeCandidate({
      id: 'stale',
      score: 4.0,
      title: recentTitle,
    });
    const fresh = makeCandidate({
      id: 'fresh',
      score: 2.0,
      title: 'Review permit appeal draft',
    });

    const guardrails = {
      approvedRecently: [
        { directive_text: recentTitle, action_type: 'send_message', generated_at: new Date().toISOString() },
      ],
      skippedRecently: [],
    };

    const { winner } = selectFinalWinner([stale, fresh], guardrails);
    expect(winner.id).toBe('fresh');
  });

  it('all disqualified falls back to scored[0]', () => {
    const title1 = 'Send follow up to Carol about the invoice payment';
    const title2 = 'Send follow up to Dave about the grant application';
    const c1 = makeCandidate({ id: 'c1', score: 3.0, title: title1 });
    const c2 = makeCandidate({ id: 'c2', score: 2.5, title: title2 });

    const guardrails = {
      approvedRecently: [
        { directive_text: title1, action_type: 'send_message', generated_at: new Date().toISOString() },
        { directive_text: title2, action_type: 'send_message', generated_at: new Date().toISOString() },
      ],
      skippedRecently: [],
    };

    // Both disqualified — should fall back to topCandidates[0]
    const { winner } = selectFinalWinner([c1, c2], guardrails);
    expect(winner.id).toBe('c1');
  });

  it('competition context lists beaten candidates', () => {
    const high = makeCandidate({ id: 'high', score: 3.0, title: 'Top item to do' });
    const low = makeCandidate({ id: 'low', score: 1.5, title: 'Lower priority item' });
    const { competitionContext } = selectFinalWinner([high, low], NO_GUARDRAILS);
    expect(competitionContext).toContain('CANDIDATE_COMPETITION');
    expect(competitionContext).toContain('Winner:');
    expect(competitionContext).toContain('Beaten:');
  });

  it('fresh signal (≤2d) gets +8% bonus over stale signal (>10d)', () => {
    const freshMs = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago
    const staleMs = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago

    const freshCand = makeCandidate({
      id: 'fresh',
      score: 2.0,
      title: 'Act on recent message',
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(freshMs).toISOString() }],
    });
    const staleCand = makeCandidate({
      id: 'stale',
      score: 2.2,
      title: 'Old unresolved thing',
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(staleMs).toISOString() }],
    });

    // fresh: 2.0 * 1.08 = 2.16; stale: 2.2 * 0.88 = 1.936 — fresh wins
    const { winner } = selectFinalWinner([staleCand, freshCand], NO_GUARDRAILS);
    expect(winner.id).toBe('fresh');
  });

  it('disqualifies schedule-only candidate from winning final rank', () => {
    const scheduleOnly = makeCandidate({
      id: 'schedule-only',
      score: 4.4,
      type: 'signal',
      suggestedActionType: 'schedule',
      title: 'Schedule a 30 minute block',
      content: 'Schedule a 30 minute block to think about this.',
    });
    const discrepancy = makeCandidate({
      id: 'discrepancy',
      score: 3.8,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      title: 'Timing asymmetry: deadline closes while response window shrinks',
      content: 'Response window dropped from 7 days to 2 days with no owner reply.',
    });

    const { winner } = selectFinalWinner([scheduleOnly, discrepancy], NO_GUARDRAILS);
    expect(winner.id).toBe('discrepancy');
  });

  it('discrepancy outranks generic follow-up task when both are present', () => {
    const genericTask = makeCandidate({
      id: 'generic-task',
      score: 4.6,
      type: 'commitment',
      title: 'Follow up with team',
      content: 'Follow up with team.',
    });
    const discrepancy = makeCandidate({
      id: 'hidden-risk',
      score: 3.9,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      title: 'Unseen risk: approval blocker surfaced late in thread',
      content: 'New blocker now conflicts with approval timeline and no mitigation plan exists.',
    });

    const { winner } = selectFinalWinner([genericTask, discrepancy], NO_GUARDRAILS);
    expect(winner.id).toBe('hidden-risk');
  });

  it('hunt send_message is preferred over internal discrepancy write_document when both are short-listed', () => {
    const discrepancy = makeCandidate({
      id: 'disc-internal-memo',
      score: 10,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      discrepancyClass: 'drift',
      title: 'Cross-thread drift needs internal diagnosis memo',
      content: 'Signals show priority drift with no single external reply obligation.',
    });
    const hunt = makeCandidate({
      id: 'hunt-reply-external',
      score: 8,
      type: 'hunt',
      suggestedActionType: 'send_message',
      entityName: 'Alex Rivera',
      title: 'Reply pending on Alex Rivera contract thread',
      content: 'Inbound from Alex Rivera <alex@clientco.com> on redlines; response overdue.',
      sourceSignals: [
        { kind: 'signal', id: 'sig-alex-1', summary: 'Alex contract thread', occurredAt: new Date().toISOString() },
      ],
      lifecycle: {
        state: 'active_now',
        horizon: 'now',
        actionability: 'actionable',
        reason: 'test',
      },
    });

    const { winner } = selectFinalWinner([discrepancy, hunt], NO_GUARDRAILS);
    expect(winner.id).toBe('hunt-reply-external');
  });

  it('thread-backed relationship send_message wins viability over internal write_document discrepancy', () => {
    const outreach = makeCandidate({
      id: 'outreach-keri',
      score: 6.0,
      type: 'relationship',
      suggestedActionType: 'send_message',
      entityName: 'Keri Nopens',
      title: 'Send outreach email to Keri Nopens',
      content: 'Concrete reference and timeline thread with Keri Nopens regarding MAS3 role.',
      relatedSignals: ['Email thread with Keri about references'],
      sourceSignals: [{ kind: 'signal', summary: 'Keri reference coordination', occurredAt: new Date().toISOString() }],
    });
    const discrepancy = makeCandidate({
      id: 'goal-drift',
      score: 4.5,
      type: 'discrepancy',
      discrepancyClass: 'goal_velocity_mismatch',
      suggestedActionType: 'write_document',
      title: 'Goal momentum lost on revenue target',
      content: 'Stated revenue goal shows dropped signal velocity versus prior weeks.',
    });

    const { winner } = selectFinalWinner([outreach, discrepancy], NO_GUARDRAILS);
    expect(winner.id).toBe('outreach-keri');
  });

  it('obvious first-layer advice is disqualified in favor of decision-moving candidate', () => {
    const obvious = makeCandidate({
      id: 'obvious',
      score: 5.0,
      title: 'Check in with recruiter',
      content: 'Check in with recruiter.',
    });
    const decisionMoving = makeCandidate({
      id: 'decision-moving',
      score: 3.7,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      title: 'Contradiction: runway goal tightened while spend increased',
      content: 'Runway target reduced while discretionary spend rose 22% this week.',
    });

    const { winner } = selectFinalWinner([obvious, decisionMoving], NO_GUARDRAILS);
    expect(winner.id).toBe('decision-moving');
  });

  it('prefers a goal-anchored behavioral discrepancy over an unanchored schedule conflict', () => {
    const scheduleConflict = makeCandidate({
      id: 'schedule-conflict',
      score: 1.4538,
      type: 'discrepancy',
      discrepancyClass: 'schedule_conflict',
      suggestedActionType: 'write_document',
      title: 'Overlapping events on 2026-04-25',
      content: 'You have overlapping calendar commitments on 2026-04-25: "Babe baby shower" and "N Soccer game".',
      matchedGoal: null,
      relatedSignals: [],
      sourceSignals: [
        { kind: 'signal', summary: 'Babe baby shower overlap', occurredAt: new Date().toISOString() },
        { kind: 'signal', summary: 'N Soccer game overlap', occurredAt: new Date().toISOString() },
      ],
    });
    const behavioral = makeCandidate({
      id: 'behavioral-mas3',
      score: 1.3591,
      type: 'discrepancy',
      discrepancyClass: 'behavioral_pattern',
      suggestedActionType: 'write_document',
      title: "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since",
      content: "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since",
      matchedGoal: {
        text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
        priority: 1,
        category: 'career',
      },
      relatedSignals: [],
      sourceSignals: [
        { kind: 'signal', summary: 'MAS3 hiring decision thread stalled', occurredAt: new Date().toISOString() },
      ],
    });

    const { winner } = selectFinalWinner([scheduleConflict, behavioral], NO_GUARDRAILS);
    expect(winner.id).toBe('behavioral-mas3');
  });
});
