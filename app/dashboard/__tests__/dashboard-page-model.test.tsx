import { describe, expect, it } from 'vitest';
import {
  getDashboardDiscrepancyFrame,
  getDocumentCollectionIntakePrompt,
  inferSourcePills,
  isDocumentCollectionRequirementsAction,
  isDashboardActionSummary,
  isVisibleDashboardAction,
  needsDashboardActionDetail,
  type DashboardAction,
} from '../dashboard-page-model';

const VALID_DISCREPANCY_ACTION: DashboardAction = {
  id: 'action-valid',
  directive: 'Finalize the MAS3 interview packet owner.',
  action_type: 'write_document',
  reason:
    'The interview is confirmed, but the packet still has no owner before the prep window closes.',
  evidence: [{ description: 'Alex confirmed the interview.' }],
  artifact: {
    type: 'document',
    title: 'MAS3 packet owner decision',
    body: 'Assign Holly as packet owner by 4 PM PT today.',
  },
  discrepancy_card: {
    claim: 'The MAS3 interview packet is ready for final owner review.',
    contradiction:
      'Alex confirmed the April 29 interview, but the packet still has no named owner.',
    risk: 'The packet may miss the same-day prep window if ownership is not assigned today.',
    evidence: [
      'Gmail: Alex confirmed the April 29 interview.',
      'Drive: packet owner field is still blank.',
    ],
    next_action: 'Assign Holly as packet owner before 4 PM PT today.',
    why_now: 'The prep window closes today.',
    source_refs: ['gmail:alex-confirmed', 'drive:packet-owner'],
    confidence: 0.86,
    pattern_keys: ['discrepancy:interview_role_fit', 'action:write_document'],
  },
};

describe('dashboard discrepancy visibility contract', () => {
  it('allows a valid artifact only when it carries a passing discrepancy frame', () => {
    expect(isVisibleDashboardAction(VALID_DISCREPANCY_ACTION)).toBe(true);
    expect(getDashboardDiscrepancyFrame(VALID_DISCREPANCY_ACTION)?.claim).toContain(
      'MAS3 interview packet',
    );
  });

  it('turns strict artifact source refs into customer-readable source pills', () => {
    expect(inferSourcePills(VALID_DISCREPANCY_ACTION)).toEqual([
      'Email thread',
      'Source document',
    ]);
    expect(inferSourcePills(VALID_DISCREPANCY_ACTION).join(' ')).not.toMatch(
      /gmail:|drive:|alex-confirmed|packet-owner/i,
    );
  });

  it('blocks a generic evidence-free artifact from reaching the dashboard', () => {
    const weakAction: DashboardAction = {
      id: 'action-weak',
      directive: 'Follow up with Keri.',
      action_type: 'send_message',
      reason: 'It has been a while.',
      evidence: [],
      artifact: {
        type: 'email',
        to: 'keri@example.com',
        subject: 'Checking in',
        body: 'Hi Keri, just checking in.',
      },
    };

    expect(isVisibleDashboardAction(weakAction)).toBe(false);
    expect(getDashboardDiscrepancyFrame(weakAction)).toBeNull();
  });

  it('recognizes a summary-only latest payload that still needs detail by id', () => {
    const summaryOnlyAction: DashboardAction = {
      id: 'action-summary',
      directive: 'Finalize the MAS3 interview packet owner.',
      action_type: 'write_document',
      reason: 'The packet is due today, but the owner is still missing.',
      discrepancy_card: VALID_DISCREPANCY_ACTION.discrepancy_card,
      discrepancy_quality: {
        passes: true,
        quality_score: 0.9,
        blocked_by: [],
        pattern_keys: ['discrepancy:interview_role_fit', 'action:write_document'],
        rejection_reason: null,
      },
      detail_required: true,
      detail_url: '/api/conviction/actions/action-summary',
    };

    expect(isVisibleDashboardAction(summaryOnlyAction)).toBe(false);
    expect(needsDashboardActionDetail(summaryOnlyAction)).toBe(true);
    expect(isDashboardActionSummary(summaryOnlyAction)).toBe(true);
  });

  it('recognizes the document collection requirements packet as a targeted intake state', () => {
    const action: DashboardAction = {
      id: 'document-collection-action',
      directive:
        'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
      action_type: 'write_document',
      artifact_readiness_state: 'REQUIREMENTS_NEEDED',
      artifact: {
        type: 'document',
        title: 'Requirements needed: Submit high-quality .docx documents for document collection',
        content: [
          'REQUIREMENTS-NEEDED PACKET',
          'To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.',
          'Paste the submission link and list/upload the candidate documents.',
        ].join('\n'),
      },
      discrepancy_card: {
        claim: 'Commitment due in 0d: Submit high-quality .docx documents for document collection',
        contradiction:
          'The document collection deadline is now, but no owned document sources or submission destination are captured.',
        risk: 'Missing the submission window risks losing the accepted commitment opportunity.',
        evidence: [
          '$50 per accepted document.',
          'Files must be real .docx documents.',
        ],
        next_action: 'Paste the submission link and list/upload the candidate documents.',
        why_now: 'The submission deadline is today.',
        source_refs: ['commitment:document-collection'],
        confidence: 0.82,
        pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
      },
    };

    expect(isDocumentCollectionRequirementsAction(action)).toBe(true);
    expect(action.artifact_readiness_state).toBe('REQUIREMENTS_NEEDED');
    expect(getDocumentCollectionIntakePrompt(action)).toEqual({
      heading: 'To finish this, provide',
      detail: 'owned .docx/source files, document topics/titles, and submission URL.',
      nextAction: 'Paste the submission link and list/upload the candidate documents.',
    });
  });

  it('allows a summary-only document collection requirements packet even when it is intentionally blocked from finished-artifact quality', () => {
    const summaryOnlyAction = {
      id: 'document-collection-summary',
      directive:
        'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
      action_type: 'write_document',
      artifact_readiness_state: 'REQUIREMENTS_NEEDED',
      artifact_title: 'Requirements needed: Submit high-quality .docx documents for document collection',
      discrepancy_card: {
        claim: 'Commitment due in 0d: Submit high-quality .docx documents for document collection',
        contradiction:
          'The document collection deadline is now, but no owned document sources or submission destination are captured.',
        risk: 'Missing the submission window risks losing the accepted commitment opportunity.',
        evidence: [
          '$50 per accepted document.',
          'Files must be real .docx documents.',
        ],
        next_action: 'Paste the submission link and list/upload the candidate documents.',
        why_now: 'The submission deadline is today.',
        source_refs: ['commitment:document-collection'],
        confidence: 0.45,
        pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
      },
      discrepancy_quality: {
        passes: false,
        quality_score: 0.8,
        blocked_by: ['weak_risk'],
        pattern_keys: ['discrepancy:deadline_staleness', 'action:write_document'],
        rejection_reason: 'weak_risk',
      },
      detail_required: true,
      detail_url: '/api/conviction/actions/document-collection-summary',
    } as DashboardAction & { artifact_title: string };

    expect(isDocumentCollectionRequirementsAction(summaryOnlyAction)).toBe(true);
    expect(isDashboardActionSummary(summaryOnlyAction)).toBe(true);
    expect(summaryOnlyAction.artifact_readiness_state).toBe('REQUIREMENTS_NEEDED');
    expect(getDashboardDiscrepancyFrame(summaryOnlyAction)?.next_action).toBe(
      'Paste the submission link and list/upload the candidate documents.',
    );
  });
});
