import { describe, expect, it } from 'vitest';
import { isMaterialChange } from '../materiality-gate';

describe('isMaterialChange — the push cost gate', () => {
  it('treats new inbound mail as material (worth spending the brain)', () => {
    const v = isMaterialChange({ gmail: 2, calendar: 0, drive: 0 });
    expect(v.material).toBe(true);
    expect(v.reason).toContain('mail');
  });

  it('treats new calendar changes as material', () => {
    const v = isMaterialChange({ gmail: 0, calendar: 1, drive: 0 });
    expect(v.material).toBe(true);
  });

  it('treats Drive-only changes as immaterial (trigger path ignores file sources)', () => {
    const v = isMaterialChange({ gmail: 0, calendar: 0, drive: 5 });
    expect(v.material).toBe(false);
    expect(v.reason).toContain('Drive-only');
  });

  it('treats an empty delta as immaterial', () => {
    const v = isMaterialChange({ gmail: 0, calendar: 0, drive: 0 });
    expect(v.material).toBe(false);
    expect(v.reason).toContain('no new signals');
  });

  it('mail dominates even when Drive also changed', () => {
    const v = isMaterialChange({ gmail: 1, calendar: 0, drive: 9 });
    expect(v.material).toBe(true);
  });
});
