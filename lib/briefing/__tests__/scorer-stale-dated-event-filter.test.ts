import { describe, expect, it } from 'vitest';

import { filterStaleDatedEventCandidatesBeforeScoring } from '../scorer';

const nowMs = Date.parse('2026-04-30T12:00:00.000Z');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    type: 'signal',
    title: 'MAS3 interview with Alex Rivera',
    content: 'MAS3 interview with Alex Rivera',
    actionType: 'write_document',
    urgency: 0.5,
    matchedGoal: null,
    domain: 'career',
    sourceSignals: [
      {
        kind: 'signal',
        id: 'signal-1',
        occurredAt: '2026-04-26T11:59:59.000Z',
        summary: 'MAS3 interview with Alex Rivera',
      },
    ],
    ...overrides,
  };
}

describe('filterStaleDatedEventCandidatesBeforeScoring', () => {
  it('drops interview, meeting, and deadline candidates older than three days before scoring', () => {
    const staleInterview = candidate({
      id: 'stale-interview',
      title: 'MAS3 interview with Alex Rivera',
      content: 'Prepare for the MAS3 interview with Alex Rivera',
    });
    const staleMeetingByReferencedDate = candidate({
      id: 'stale-meeting',
      title: 'Client meeting with Morgan Lee',
      content: 'Client meeting with Morgan Lee',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'signal-2',
          occurredAt: '2026-04-30T11:00:00.000Z',
          summary: 'Client meeting with Morgan Lee',
        },
      ],
      calendarEventStartMs: Date.parse('2026-04-26T15:00:00.000Z'),
    });
    const staleDeadline = candidate({
      id: 'stale-deadline',
      title: 'Deadline for HCBM packet',
      content: 'Deadline for HCBM packet',
      commitmentDueMs: Date.parse('2026-04-26T15:00:00.000Z'),
    });

    const result = filterStaleDatedEventCandidatesBeforeScoring([
      staleInterview,
      staleMeetingByReferencedDate,
      staleDeadline,
    ], nowMs);

    expect(result.passed).toEqual([]);
    expect(result.dropped.map((drop) => drop.candidate.id)).toEqual([
      'stale-interview',
      'stale-meeting',
      'stale-deadline',
    ]);
  });

  it('keeps current dated events and stale non-event candidates', () => {
    const currentInterview = candidate({
      id: 'current-interview',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'signal-3',
          occurredAt: '2026-04-27T12:00:00.000Z',
          summary: 'MAS3 interview with Alex Rivera',
        },
      ],
    });
    const staleNonEvent = candidate({
      id: 'stale-non-event',
      title: 'Alex Rivera shared the signed contract amount',
      content: 'Alex Rivera shared the signed contract amount',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'signal-4',
          occurredAt: '2026-04-20T12:00:00.000Z',
          summary: 'Signed contract amount',
        },
      ],
    });

    const result = filterStaleDatedEventCandidatesBeforeScoring([
      currentInterview,
      staleNonEvent,
    ], nowMs);

    expect(result.passed.map((passed) => passed.id)).toEqual([
      'current-interview',
      'stale-non-event',
    ]);
    expect(result.dropped).toEqual([]);
  });
});
