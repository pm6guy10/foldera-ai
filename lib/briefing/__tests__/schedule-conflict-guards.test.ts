import { describe, expect, it } from 'vitest';
import {
  directiveLooksLikeScheduleConflict,
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

  it('allows plain outbound-style messages without owner procedure markers', () => {
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
