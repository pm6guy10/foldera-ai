import { describe, expect, it } from 'vitest';

import { inferActionType, isExecutableCommitment } from '../scorer';

describe('interview commitment admission', () => {
  it('admits recruiting interview attendance without an explicit goal match', () => {
    expect(
      isExecutableCommitment(
        'Accepted Interview - Recruitment 2026-02344 ESB Tech',
        'attend_participate',
        false,
      ),
    ).toBe(true);
    expect(
      isExecutableCommitment(
        'MAS3 Project interview',
        'attend_participate',
        false,
      ),
    ).toBe(true);
  });

  it('keeps generic attendance noise blocked when no goal matches', () => {
    expect(isExecutableCommitment('Momco meeting', 'attend_participate', false)).toBe(false);
    expect(isExecutableCommitment('Sunnyside Appt', 'attend_participate', false)).toBe(false);
  });

  it('routes interview commitments to write_document instead of default send_message', () => {
    expect(inferActionType('MAS3 Project interview', 'commitment')).toBe('write_document');
    expect(
      inferActionType(
        'Phone screen conversation to discuss the Care Coordinator role',
        'commitment',
      ),
    ).toBe('write_document');
  });
});
