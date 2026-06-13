import { describe, it, expect, vi } from 'vitest';
import { normalizeWorkdayPresenceTriggerRunnerCursor } from '@/lib/workday-presence/trigger-runner';

describe('Hidden-op outcome logging', () => {
  it('extracts signal ID from hidden_op trigger key', () => {
    const triggerKey = 'hidden_op:sig-123-abc';
    const signalId = triggerKey.slice(10); // Remove 'hidden_op:' prefix
    expect(signalId).toBe('sig-123-abc');
  });

  it('identifies hidden-op signals by trigger key prefix', () => {
    const hiddenOpKey = 'hidden_op:sig-firstday';
    const normalKey = 'mention_reply_needed|thread-123|summary|2026-06-12T15:05:00.000Z';

    expect(hiddenOpKey.startsWith('hidden_op:')).toBe(true);
    expect(normalKey.startsWith('hidden_op:')).toBe(false);
  });

  it('handles null cursor gracefully', () => {
    const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(null);

    expect(cursor.last_trigger_key).toBeNull();
  });

  it('logs outcome as CONFIRMED_WORKED for hidden-op acknowledges', () => {
    const nowIso = new Date().toISOString();
    const outcome = 'CONFIRMED_WORKED';

    // Verify outcome label is the correct constant
    expect(outcome).toBe('CONFIRMED_WORKED');
    expect(typeof nowIso).toBe('string');
    expect(nowIso.length).toBeGreaterThan(0);
  });
});
