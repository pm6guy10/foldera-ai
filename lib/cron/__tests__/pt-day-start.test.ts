import { describe, expect, it } from 'vitest';
import { ptDayStartIso } from '../daily-brief-generate';

describe('ptDayStartIso', () => {
  it('anchors to 07:00 UTC during PDT', () => {
    const now = new Date('2026-04-25T11:38:34.833Z');
    expect(ptDayStartIso(now)).toBe('2026-04-25T07:00:00.000Z');
  });

  it('anchors to 08:00 UTC during PST', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    expect(ptDayStartIso(now)).toBe('2026-01-15T08:00:00.000Z');
  });

  it('uses Pacific local date when UTC date has already rolled over', () => {
    const now = new Date('2026-04-25T06:30:00.000Z');
    expect(ptDayStartIso(now)).toBe('2026-04-24T07:00:00.000Z');
  });

  it('keeps fall-back day start at midnight PT before the offset switch', () => {
    const now = new Date('2026-11-01T10:30:00.000Z');
    expect(ptDayStartIso(now)).toBe('2026-11-01T07:00:00.000Z');
  });
});
