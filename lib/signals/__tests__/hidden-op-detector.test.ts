import { describe, expect, it } from 'vitest';
import { classifyDomain, detectHiddenOps, type HiddenOpInput } from '../hidden-op-detector';

const NOW = '2026-06-13T00:00:00.000Z';

function detect(signals: HiddenOpInput[]) {
  return detectHiddenOps(signals, { nowIso: NOW, limit: 10 });
}

// A slice shaped like Brandon's real stream: one quiet pivotal event buried in noise.
function realisticStream(): HiddenOpInput[] {
  const stream: HiddenOpInput[] = [
    {
      id: 'cwu',
      source: 'outlook_calendar',
      author: 'b-kapp@outlook.com',
      occurredAtIso: '2026-06-13T00:00:00.000Z',
      type: 'calendar_event',
      dueIso: '2026-06-16T00:00:00.000Z',
      description: 'First day of work at CWU',
    },
    {
      id: 'trash1',
      source: 'outlook_calendar',
      author: 'b-kapp@outlook.com',
      occurredAtIso: '2026-06-13T00:00:00.000Z',
      type: 'calendar_event',
      dueIso: '2026-06-16T00:00:00.000Z',
      description: 'Put Trash Can Out',
    },
    {
      id: 'bible',
      source: 'outlook_calendar',
      author: 'b-kapp@outlook.com',
      occurredAtIso: '2026-06-13T00:00:00.000Z',
      type: 'calendar_event',
      dueIso: '2026-06-16T00:00:00.000Z',
      description: 'Bible study at Brightside',
    },
  ];
  // 30 recurring trash/recycling entries + 600 github pings — the volume noise.
  for (let i = 0; i < 15; i++) {
    stream.push({ id: `trash-r${i}`, source: 'outlook_calendar', author: 'b-kapp@outlook.com', occurredAtIso: NOW, type: 'calendar_event', dueIso: NOW, description: 'Put Trash Can Out' });
    stream.push({ id: `bible-r${i}`, source: 'outlook_calendar', author: 'b-kapp@outlook.com', occurredAtIso: NOW, type: 'calendar_event', dueIso: NOW, description: 'Bible study at Brightside' });
  }
  for (let i = 0; i < 600; i++) {
    stream.push({ id: `gh${i}`, source: 'gmail', author: 'notifications@github.com', occurredAtIso: NOW, type: 'email_received', dueIso: NOW, description: 'Pull request comment on your repo' });
  }
  return stream;
}

describe('hidden-op-detector — the thesis: consequence beats volume', () => {
  it('surfaces "First day at CWU" as #1 over a same-day trash reminder and 600 GitHub pings', () => {
    const ops = detectHiddenOps(realisticStream(), { nowIso: NOW, limit: 1000 });
    expect(ops[0].id).toBe('cwu');
    expect(ops[0].domain).toBe('work_transition');
    // The pivotal one-off beats the highest-scoring chore decisively.
    const bestChore = ops.find((o) => o.domain === 'chore')!;
    expect(ops[0].score).toBeGreaterThan(bestChore.score + 30);
  });

  it('drowns the 600-volume GitHub noise near the floor', () => {
    const ops = detect(realisticStream());
    const gh = ops.find((o) => o.id.startsWith('gh'));
    // GitHub pings should not even reach the top of the list.
    expect(ops.slice(0, 3).some((o) => o.id.startsWith('gh'))).toBe(false);
    if (gh) expect(gh.score).toBeLessThan(40);
  });
});

describe('hidden-op-detector — domain classification', () => {
  it('classifies the real obligation strings from the stream', () => {
    expect(classifyDomain('First day of work at CWU')).toBe('work_transition');
    expect(classifyDomain('AutoPay payment of $198.00 processed')).toBe('money');
    expect(classifyDomain('Talon Carswell is scheduled to provide a meal (Chicken Enchiladas)')).toBe('family_baby');
    expect(classifyDomain('Pick up prescription')).toBe('medical');
    expect(classifyDomain('Put Recycling Can Out')).toBe('chore');
    expect(classifyDomain('Bible study at Brightside')).toBe('social_faith');
    expect(classifyDomain('Book hotel using $15 OneKeyCash gift before expiration')).toBe('money');
    expect(classifyDomain('random unlabeled note')).toBe('unknown');
  });
});

describe('hidden-op-detector — imminence', () => {
  const base: HiddenOpInput = {
    id: 'x', source: 'outlook_calendar', author: 'b-kapp@outlook.com', type: 'calendar_event',
    occurredAtIso: NOW, description: 'First day of work at CWU',
  };
  it('ranks a sooner pivotal event above a far-future one', () => {
    const soon = detect([{ ...base, id: 'soon', dueIso: '2026-06-15T00:00:00.000Z' }]);
    const far = detect([{ ...base, id: 'far', dueIso: '2026-08-30T00:00:00.000Z' }]);
    expect(soon[0].score).toBeGreaterThan(far[0].score);
  });
  it('damps a long-past obligation toward moot', () => {
    const past = detect([{ ...base, id: 'past', dueIso: '2026-04-01T00:00:00.000Z' }]);
    const soon = detect([{ ...base, id: 'soon', dueIso: '2026-06-15T00:00:00.000Z' }]);
    expect(past[0].score).toBeLessThan(soon[0].score);
  });
});

describe('hidden-op-detector — money + family still surface among noise', () => {
  it('keeps the Amex autopay and MealTrain meal in the ranked set above chores', () => {
    const signals: HiddenOpInput[] = [
      { id: 'amex', source: 'outlook', author: 'AmericanExpress@welcome.americanexpress.com', type: 'email_received', occurredAtIso: NOW, dueIso: '2026-06-14T00:00:00.000Z', description: 'AutoPay payment of $198.00 due' },
      { id: 'meal', source: 'outlook', author: 'mail@mealtrain.com', type: 'email_received', occurredAtIso: NOW, dueIso: '2026-06-14T00:00:00.000Z', description: 'Talon Carswell is scheduled to provide a meal (Chicken Enchiladas)' },
      { id: 'trash', source: 'outlook_calendar', author: 'b-kapp@outlook.com', type: 'calendar_event', occurredAtIso: NOW, dueIso: '2026-06-14T00:00:00.000Z', description: 'Put Trash Can Out' },
    ];
    const ops = detect(signals);
    const idx = (id: string) => ops.findIndex((o) => o.id === id);
    expect(idx('amex')).toBeLessThan(idx('trash'));
    expect(idx('meal')).toBeLessThan(idx('trash'));
  });
});

describe('hidden-op-detector — robustness', () => {
  it('skips signals with no obligation text and bounds score to [0,100]', () => {
    const ops = detectHiddenOps(
      [
        { id: 'empty', source: 'gmail', author: 'x@y.com', occurredAtIso: NOW, description: '' },
        { id: 'maxy', source: 'outlook_calendar', author: 'b-kapp@outlook.com', type: 'calendar_event', occurredAtIso: NOW, dueIso: '2026-06-13T12:00:00.000Z', description: 'First day of work at CWU new job onboarding orientation' },
      ],
      { nowIso: NOW },
    );
    expect(ops.find((o) => o.id === 'empty')).toBeUndefined();
    for (const o of ops) {
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns an empty list for an empty stream', () => {
    expect(detectHiddenOps([], { nowIso: NOW })).toEqual([]);
  });
});
