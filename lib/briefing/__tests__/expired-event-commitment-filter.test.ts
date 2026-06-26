import { describe, expect, it } from 'vitest';
import {
  isExpiredEventCommitment,
  partitionExpiredEventCommitments,
  type ExpirableCommitment,
} from '../scorer';

// Fixed "now" so the tests are deterministic.
const NOW = Date.parse('2026-06-26T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * day).toISOString();

describe('expired event commitment filter (#537 structural zombie guard)', () => {
  it('drops a past event commitment (a birthday that already happened)', () => {
    const past: ExpirableCommitment = {
      id: 'a',
      category: 'attend_participate',
      due_at: iso(-24), // "Mom's birthday" weeks ago
      description: "Mom's birthday",
    };
    expect(isExpiredEventCommitment(past, NOW)).toBe(true);
  });

  it('keeps a future event commitment (a birthday that has not happened yet)', () => {
    const future: ExpirableCommitment = {
      category: 'attend_participate',
      due_at: iso(6), // "Nathaniel's birthday" in 6 days
      description: "Nathaniel's Birthday",
    };
    expect(isExpiredEventCommitment(future, NOW)).toBe(false);
  });

  it('keeps an event on its own day (within the one-day grace)', () => {
    const today: ExpirableCommitment = {
      category: 'attend_participate',
      due_at: iso(0),
      description: 'Event today',
    };
    expect(isExpiredEventCommitment(today, NOW)).toBe(false);
  });

  it('PRESERVES an overdue ACTION commitment — overdue makes it more urgent, not moot', () => {
    for (const category of [
      'follow_up',
      'payment_financial',
      'deliver_document',
      'provide_information',
      'review_approve',
      'make_decision',
      'schedule_meeting',
      'other',
    ]) {
      const overdueAction: ExpirableCommitment = {
        category,
        due_at: iso(-30),
        description: `overdue ${category}`,
      };
      expect(isExpiredEventCommitment(overdueAction, NOW)).toBe(false);
    }
  });

  it('keeps an event commitment that has no hard date', () => {
    const noDate: ExpirableCommitment = {
      category: 'attend_participate',
      due_at: null,
      description: 'undated occasion',
    };
    expect(isExpiredEventCommitment(noDate, NOW)).toBe(false);
  });

  it('partitions a mixed pool: past events out, everything else kept (order preserved)', () => {
    const pool: ExpirableCommitment[] = [
      { id: 'past-bday', category: 'attend_participate', due_at: iso(-24), description: "Mom's birthday" },
      { id: 'owed-reply', category: 'follow_up', due_at: iso(-3), description: 'overdue owed reply' },
      { id: 'future-bday', category: 'attend_participate', due_at: iso(6), description: "Nathaniel's Birthday" },
      { id: 'overdue-bill', category: 'payment_financial', due_at: iso(-10), description: 'overdue invoice' },
      { id: 'past-meeting', category: 'attend_participate', due_at: iso(-1.5), description: 'meeting that already happened' },
    ];
    const { kept, expired } = partitionExpiredEventCommitments(pool, NOW);
    expect(expired.map((c) => c.id)).toEqual(['past-bday', 'past-meeting']);
    // Overdue action + payment + future event all survive; original order preserved.
    expect(kept.map((c) => c.id)).toEqual(['owed-reply', 'future-bday', 'overdue-bill']);
  });

  it('returns the input unchanged when there are no expired events', () => {
    const pool: ExpirableCommitment[] = [
      { id: 'a', category: 'follow_up', due_at: iso(-5), description: 'x' },
      { id: 'b', category: 'attend_participate', due_at: iso(10), description: 'y' },
    ];
    const { kept, expired } = partitionExpiredEventCommitments(pool, NOW);
    expect(expired).toEqual([]);
    expect(kept).toHaveLength(2);
  });
});
