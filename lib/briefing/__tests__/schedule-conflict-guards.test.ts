import { describe, expect, it } from 'vitest';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactHasResolutionShape,
  scheduleConflictArtifactIsMessageShaped,
  scheduleConflictArtifactIsOwnerProcedure,
} from '../schedule-conflict-guards';
import type { ConvictionDirective } from '../types';

describe('directiveLooksLikeScheduleConflict', () => {
  it('detects calendar overlap from directive headline when discrepancyClass is missing', () => {
    const d: ConvictionDirective = {
      directive: 'Overlapping events on 2026-04-02.',
      action_type: 'write_document',
      confidence: 80,
      reason: 'Two blocks overlap.',
      evidence: [{ type: 'signal', description: 'x' }],
    };
    expect(directiveLooksLikeScheduleConflict(d)).toBe(true);
  });
});

describe('scheduleConflictArtifactIsOwnerProcedure', () => {
  it('flags numbered lists and owner calendar instructions', () => {
    expect(
      scheduleConflictArtifactIsOwnerProcedure(
        '1. Open your calendar.\n2. Move the lower-priority event.',
      ),
    ).toBe(true);
    expect(scheduleConflictArtifactIsOwnerProcedure('First open your calendar, then pick a slot.')).toBe(true);
    expect(scheduleConflictArtifactIsOwnerProcedure('Decide which meeting to keep on 2026-04-02.')).toBe(true);
    expect(
      scheduleConflictArtifactIsOwnerProcedure('Objective: fix overlap\n\nExecution Notes:\n- overlap exists'),
    ).toBe(true);
    expect(
      scheduleConflictArtifactIsOwnerProcedure(
        'Objective: Overlapping events on 2026-04-02.\n\nExecution Notes:\n- Which takes priority, and how will you communicate the trade-off?',
      ),
    ).toBe(true);
    expect(
      scheduleConflictArtifactIsOwnerProcedure(
        'You have overlapping calendar commitments. Which takes priority, and how will you communicate the trade-off?',
      ),
    ).toBe(true);
  });

  it('does not classify outbound message copy as owner procedure (message shape is handled separately)', () => {
    expect(
      scheduleConflictArtifactIsOwnerProcedure(
        'MESSAGE TO Dana:\n\nHi Dana — I have a conflict on 2026-04-02. Could we reschedule our sync to Monday?',
      ),
    ).toBe(false);
    expect(
      scheduleConflictArtifactIsOwnerProcedure(
        'Hi Mom — I double-booked 2026-04-02. Would morning or afternoon work better for cake?',
      ),
    ).toBe(false);
  });
});

describe('scheduleConflictArtifactIsMessageShaped', () => {
  it('flags MESSAGE TO blocks and salutation-led outbound copy', () => {
    expect(
      scheduleConflictArtifactIsMessageShaped(
        'MESSAGE TO Dana:\n\nHi Dana — I have a conflict on 2026-04-02.',
      ),
    ).toBe(true);
    expect(
      scheduleConflictArtifactIsMessageShaped(
        'Hi Chris — I am double-booked on 2026-04-02. Could we move the sync?',
      ),
    ).toBe(true);
  });

  it('returns false for resolution-note markdown', () => {
    expect(
      scheduleConflictArtifactIsMessageShaped(`## Situation
Overlap on 2026-04-02.

## Recommendation / decision
Move the sync; keep the dentist.

## Owner / next step
You confirm by 2026-04-01.

## Timing / deadline
2026-04-02 is the conflict date.`),
    ).toBe(false);
  });
});

describe('scheduleConflictArtifactHasResolutionShape', () => {
  it('requires situation, conflict, recommendation, ownership, and timing signals', () => {
    const good = `## Situation
Two events overlap on 2026-04-02.

## Conflicting commitments or risk
Double-booking forces a trade-off.

## Recommendation / decision
Move Event A; keep Event B.

## Owner / next step
You decide before EOD.

## Timing / deadline
2026-04-01 COB; conflict 2026-04-02.`;
    expect(scheduleConflictArtifactHasResolutionShape(good)).toBe(true);
    expect(scheduleConflictArtifactHasResolutionShape('MESSAGE TO Pat:\n\nHi Pat — …')).toBe(false);
  });
});
