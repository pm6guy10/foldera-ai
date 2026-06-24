import { describe, expect, it } from 'vitest';
import { findObservationShapeReason, buildInterviewWriteDocumentValidatorRepairAddendum } from '../generator';

describe('findObservationShapeReason', () => {
  // audit-verbatim observation strings that MUST be caught
  it('catches "reveals systematic avoidance"', () => {
    expect(findObservationShapeReason('9 inbound signals from Brandon Kapp with zero replies reveals systematic avoidance')).toBe('reveals_pattern_about_user');
  });

  it('catches "reveals a gap"', () => {
    expect(findObservationShapeReason('Cross-contact deadline pattern reveals a gap in your follow-up')).toBe('reveals_pattern_about_user');
  });

  it('catches "needs systematic tracking"', () => {
    expect(findObservationShapeReason('Cross-contact deadline pattern needs systematic tracking')).toBe('needs_tracking_homework');
  });

  it('catches "needs a system"', () => {
    expect(findObservationShapeReason('Your inbox backlog needs a system to resolve it')).toBe('needs_tracking_homework');
  });

  it('catches "creates deletion risk"', () => {
    expect(findObservationShapeReason('Cloud storage commitment made 10 days ago with zero follow-through creates deletion risk')).toBe('names_abstract_risk');
  });

  it('catches "creates exposure"', () => {
    expect(findObservationShapeReason('Failure to respond to the vendor creates exposure for the deal')).toBe('names_abstract_risk');
  });

  it('catches "zero replies" behavioral diagnosis (string also matches reveals pattern — either reason is valid)', () => {
    // "zero replies reveals avoidance" matches reveals_pattern_about_user first; what matters is it's caught.
    expect(findObservationShapeReason('Brandon Kapp with zero replies reveals avoidance')).not.toBeNull();
  });

  it('catches pure "zero replies" without reveals context', () => {
    expect(findObservationShapeReason('You have zero replies across 9 threads')).toBe('behavioral_diagnosis');
  });

  it('catches "systematic avoidance" behavioral diagnosis', () => {
    expect(findObservationShapeReason('This pattern is evidence of systematic avoidance of difficult conversations')).toBe('behavioral_diagnosis');
  });

  it('catches second-person behavioral diagnosis — "you\'re avoiding"', () => {
    expect(findObservationShapeReason("You're avoiding the reply to Darlene Craig")).toBe('diagnoses_user_behavior');
  });

  it('catches second-person behavioral diagnosis — "you keep ignoring"', () => {
    expect(findObservationShapeReason("You keep ignoring follow-up requests from the recruiter")).toBe('diagnoses_user_behavior');
  });

  // The April-22 finished-work directive MUST NOT be caught
  it('does NOT catch the April-22 magic act', () => {
    expect(findObservationShapeReason(
      'Darlene Craig (darlene.craig@esd.wa.gov) sent you interview questions for ESB Technician on April 21. Here is your completed prep.'
    )).toBeNull();
  });

  it('does NOT catch a grounded send-message directive', () => {
    expect(findObservationShapeReason(
      'Reply to Sarah Kim confirming the onboarding call on June 27 at 2pm.'
    )).toBeNull();
  });

  it('does NOT catch a finished write_document directive', () => {
    expect(findObservationShapeReason(
      'Teladoc sent you a member health survey. Here is the completed form.'
    )).toBeNull();
  });
});

describe('buildInterviewWriteDocumentValidatorRepairAddendum — observation_shape triggers', () => {
  it('returns non-null for observation_shape issue', () => {
    const result = buildInterviewWriteDocumentValidatorRepairAddendum([
      'observation_shape:reveals_pattern_about_user — directive states an observation about the user instead of handing over finished work',
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain('observation_shape:reveals_pattern_about_user');
    expect(result).toContain('noticed');
  });

  it('returns non-null for triage_chore_list issue', () => {
    const result = buildInterviewWriteDocumentValidatorRepairAddendum([
      'triage_chore_list — produce copy-paste-ready finished work; no chore checklists or triage lists',
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain('triage_chore_list');
    expect(result).toContain('copy-paste');
  });

  it('still returns null for unrelated issues', () => {
    expect(
      buildInterviewWriteDocumentValidatorRepairAddendum([
        'directive must be exactly one sentence',
      ]),
    ).toBeNull();
  });
});
