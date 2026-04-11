import { describe, expect, it } from 'vitest';
import { applyInteractiveStaleGateBypass } from '../daily-brief-generate';

describe('applyInteractiveStaleGateBypass', () => {
  it('forces skipStaleGate for settings_run_brief even when caller omitted the flag', () => {
    const out = applyInteractiveStaleGateBypass({
      briefInvocationSource: 'settings_run_brief',
    });
    expect(out.skipStaleGate).toBe(true);
  });

  it('forces skipStaleGate when skipManualCallLimit is true', () => {
    const out = applyInteractiveStaleGateBypass({ skipManualCallLimit: true });
    expect(out.skipStaleGate).toBe(true);
  });

  it('preserves skipStaleGate false for cron_daily_brief when no manual flags', () => {
    const out = applyInteractiveStaleGateBypass({
      briefInvocationSource: 'cron_daily_brief',
    });
    expect(out.skipStaleGate).not.toBe(true);
  });

  it('preserves explicit skipStaleGate true for any caller', () => {
    const out = applyInteractiveStaleGateBypass({
      briefInvocationSource: 'cron_daily_brief',
      skipStaleGate: true,
    });
    expect(out.skipStaleGate).toBe(true);
  });
});
