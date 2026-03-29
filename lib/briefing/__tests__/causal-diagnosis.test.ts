import { describe, expect, it } from 'vitest';
import { getCausalDiagnosisIssues, parseGeneratedPayload } from '../generator';

describe('causal diagnosis layer', () => {
  it('parses causal_diagnosis from generated payload JSON', () => {
    const raw = JSON.stringify({
      insight: 'Approval deadline is 24 hours away.',
      decision: 'ACT',
      directive: 'Request owner assignment and approval decision by 5 PM PT tomorrow.',
      artifact_type: 'send_message',
      artifact: {
        to: 'approver@example.com',
        subject: 'Decision required: owner + approval by tomorrow 5 PM PT',
        body: 'Can you confirm by tomorrow 5 PM PT whether we approve path A or B, and assign one accountable owner? If unresolved, filing slips.',
      },
      why_now: 'Approval deadline is tomorrow and owner is still undefined.',
      causal_diagnosis: {
        why_exists_now: 'The thread keeps asking for approval but no one owns final sign-off.',
        mechanism: 'Unowned dependency before a fixed approval deadline.',
      },
    });

    const parsed = parseGeneratedPayload(raw);
    expect(parsed?.causal_diagnosis).toEqual({
      why_exists_now: 'The thread keeps asking for approval but no one owns final sign-off.',
      mechanism: 'Unowned dependency before a fixed approval deadline.',
    });
  });

  it('rejects surface follow-up when diagnosis implies unowned dependency risk', () => {
    const issues = getCausalDiagnosisIssues({
      actionType: 'send_message',
      directiveText: 'Follow up with the approver.',
      reason: 'This thread is quiet.',
      artifact: {
        to: 'approver@example.com',
        subject: 'Following up',
        body: 'Just checking in to see if there are updates on this thread.',
      },
      causalDiagnosis: {
        why_exists_now: 'Approval has stalled because no one owns the dependency.',
        mechanism: 'Unowned dependency before deadline.',
      },
      candidateTitle: 'Approval decision blocked by missing owner',
    });

    expect(issues).toEqual(expect.arrayContaining([
      'causal_diagnosis:surface_follow_up_mismatch',
    ]));
  });

  it('accepts mechanism-targeted artifact with owner + deadline + consequence language', () => {
    const issues = getCausalDiagnosisIssues({
      actionType: 'send_message',
      directiveText: 'Force owner assignment and yes/no approval by 5 PM PT today.',
      reason: 'Approval cannot complete until one owner is accountable before cutoff.',
      artifact: {
        to: 'approver@example.com',
        subject: 'Decision needed by 5 PM PT today: owner + approval path',
        body: 'Can you confirm by 5 PM PT today whether we approve path A or B and assign one accountable owner? If unresolved by cutoff, launch dependency stays blocked.',
      },
      causalDiagnosis: {
        why_exists_now: 'The approval thread has active requests but no named owner before cutoff.',
        mechanism: 'Unowned dependency before deadline.',
      },
      candidateTitle: 'Approval decision blocked by missing owner',
    });

    expect(issues).toEqual([]);
  });
});
