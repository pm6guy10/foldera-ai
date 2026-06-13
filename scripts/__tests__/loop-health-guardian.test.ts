import { describe, expect, it } from 'vitest';

import { evaluateLoopHealth } from '../loop-health-guardian';

const NOW = new Date('2026-06-13T12:00:00.000Z');

describe('evaluateLoopHealth', () => {
  it('reports OK when a human closed the loop within the threshold', () => {
    const result = evaluateLoopHealth({
      lastApprovedAt: '2026-06-11T12:00:00.000Z', // 2 days ago
      lastGeneratedAt: '2026-06-13T11:00:00.000Z',
      now: NOW,
      coldThresholdDays: 4,
    });
    expect(result.status).toBe('OK');
    expect(result.handsCold).toBe(false);
    expect(result.daysSinceApproved).toBeCloseTo(2, 1);
  });

  it('flags COLD when the hands go silent past the threshold even while the brain is alive', () => {
    // This is the exact production failure: brain generating daily, hands dead for weeks.
    const result = evaluateLoopHealth({
      lastApprovedAt: '2026-04-22T23:27:39.000Z', // ~52 days ago
      lastGeneratedAt: '2026-06-13T11:30:00.000Z', // generated 30 min ago
      now: NOW,
      coldThresholdDays: 4,
    });
    expect(result.status).toBe('COLD');
    expect(result.handsCold).toBe(true);
    expect(result.brainAlive).toBe(true);
    expect(result.message).toContain('LOOP COLD');
    expect(result.message).toContain('no human acted');
  });

  it('flags COLD with a quiet-brain note when nothing is generating either', () => {
    const result = evaluateLoopHealth({
      lastApprovedAt: '2026-05-01T12:00:00.000Z',
      lastGeneratedAt: '2026-05-01T12:00:00.000Z',
      now: NOW,
      coldThresholdDays: 4,
    });
    expect(result.status).toBe('COLD');
    expect(result.brainAlive).toBe(false);
    expect(result.message).toContain('Brain is also quiet');
  });

  it('reports NEVER when no human has ever closed the loop', () => {
    const result = evaluateLoopHealth({
      lastApprovedAt: null,
      lastGeneratedAt: '2026-06-13T11:00:00.000Z',
      now: NOW,
      coldThresholdDays: 4,
    });
    expect(result.status).toBe('NEVER');
    expect(result.handsCold).toBe(true);
    expect(result.daysSinceApproved).toBeNull();
  });

  it('treats the threshold boundary as still-OK (not cold at exactly the threshold)', () => {
    const result = evaluateLoopHealth({
      lastApprovedAt: '2026-06-09T12:00:00.000Z', // exactly 4 days ago
      lastGeneratedAt: '2026-06-13T11:00:00.000Z',
      now: NOW,
      coldThresholdDays: 4,
    });
    expect(result.status).toBe('OK');
    expect(result.handsCold).toBe(false);
  });
});
