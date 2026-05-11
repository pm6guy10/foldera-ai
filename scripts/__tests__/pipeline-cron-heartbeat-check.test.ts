import { describe, expect, it } from 'vitest';
import { getHeartbeatWindow, isHeartbeatInWindow } from '../pipeline-cron-heartbeat-check';

describe('getHeartbeatWindow', () => {
  it('passes at 11:40 UTC when a row exists after the 11:00 UTC lower bound', () => {
    const now = new Date('2026-05-11T11:40:00.000Z');
    const window = getHeartbeatWindow(now);

    expect(window.start.toISOString()).toBe('2026-05-11T11:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-11T11:40:00.000Z');
    expect(isHeartbeatInWindow('2026-05-11T11:15:00.000Z', window)).toBe(true);
  });

  it('still passes on a 17:33 UTC rerun when the valid row landed at 11:57 UTC', () => {
    const now = new Date('2026-05-11T17:33:40.680Z');
    const window = getHeartbeatWindow(now);

    expect(window.start.toISOString()).toBe('2026-05-11T11:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-11T17:33:40.680Z');
    expect(isHeartbeatInWindow('2026-05-11T11:57:59.576Z', window)).toBe(true);
  });

  it("fails when no row exists in today's expected window", () => {
    const now = new Date('2026-05-11T17:33:40.680Z');
    const window = getHeartbeatWindow(now);

    expect(isHeartbeatInWindow('2026-05-11T10:59:59.999Z', window)).toBe(false);
    expect(isHeartbeatInWindow('2026-05-11T17:33:40.681Z', window)).toBe(false);
  });

  it("does not count yesterday's row", () => {
    const now = new Date('2026-05-11T17:33:40.680Z');
    const window = getHeartbeatWindow(now);

    expect(isHeartbeatInWindow('2026-05-10T11:57:59.576Z', window)).toBe(false);
  });
});
