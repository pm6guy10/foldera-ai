import { describe, expect, it } from 'vitest';
import { buildInterviewWriteDocumentValidatorRepairAddendum } from '../generator';

describe('buildInterviewWriteDocumentValidatorRepairAddendum', () => {
  it('returns null when no interview_artifact or homework_handoff issues', () => {
    expect(
      buildInterviewWriteDocumentValidatorRepairAddendum([
        'decision_enforcement:summary_without_decision',
        'artifact_type must be "write_document"',
      ]),
    ).toBeNull();
  });

  it('includes exact failure lines and phrase bans for prep_trash + homework', () => {
    const addendum = buildInterviewWriteDocumentValidatorRepairAddendum([
      'homework_handoff:prepare_examples_handoff — artifact hands unfinished prep or research back to the user',
      'interview_artifact:generic_prep_trash:dress_business_casual — not finished work; remove checklist/STAR/tips handoff phrasing',
    ]);
    expect(addendum).not.toBeNull();
    expect(addendum).toContain('homework_handoff:prepare_examples_handoff');
    expect(addendum).toContain('interview_artifact:generic_prep_trash:dress_business_casual');
    expect(addendum).toContain('dress code');
    expect(addendum).toContain('prepare examples');
  });

  it('adds summary_without_decision guidance when that issue is present alongside triggers', () => {
    const addendum = buildInterviewWriteDocumentValidatorRepairAddendum([
      'homework_handoff:familiarize_handoff — artifact hands unfinished prep or research back to the user',
      'interview_artifact:generic_prep_trash:review_the_posting — not finished work',
      'decision_enforcement:summary_without_decision',
    ]);
    expect(addendum).toContain('decision_enforcement:summary_without_decision');
    expect(addendum).toContain('talking-point');
  });
});
