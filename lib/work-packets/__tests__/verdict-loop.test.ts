import { describe, expect, it } from 'vitest';
import {
  deterministicBeforeState,
  sourceBackedMoveEvidenceFixture,
  sourceBackedSilenceEvidenceFixture,
} from '@/tests/fixtures/work-packets/source-evidence';
import { buildVerdictLoopReceipt } from '../verdict-loop';

describe('verdict loop receipt', () => {
  it('collapses one source-shaped evidence fixture into one safe next move and a durable receipt', () => {
    const receipt = buildVerdictLoopReceipt({
      user_id: 'user_test_194',
      before_state: deterministicBeforeState,
      source_evidence_fixture: sourceBackedMoveEvidenceFixture,
      nowIso: '2026-06-02T15:20:00.000Z',
    });

    expect(receipt.receipt_id).toBe('verdict_loop_194_gmail_acme_renewal_review_note');
    expect(receipt.durable_receipt_path).toBe('lib/work-packets/verdict-loop.ts#buildVerdictLoopReceipt');
    expect(receipt.normalized_signals).toHaveLength(2);
    expect(receipt.context).toContain('Owner confirmed the renewal clause is acceptable.');
    expect(receipt.context).toContain('Asked for the final review note.');
    expect(receipt.verdict.kind).toBe('one_next_move');
    expect(receipt.verdict.text).toBe(deterministicBeforeState.next_move);
    expect(receipt.selected_move).toBe(deterministicBeforeState.next_move);
    expect(receipt.safe_silence_reason).toBeNull();
    expect(receipt.rejected_competing_moves).toEqual([]);
    expect(JSON.stringify(receipt)).not.toContain('multiple competing moves');
  });

  it('returns safe silence when the evidence does not justify a move', () => {
    const receipt = buildVerdictLoopReceipt({
      user_id: 'user_test_194',
      before_state: deterministicBeforeState,
      source_evidence_fixture: sourceBackedSilenceEvidenceFixture,
      nowIso: '2026-06-02T15:40:00.000Z',
    });

    expect(receipt.receipt_id).toBe('verdict_loop_194_calendar_acme_status_only');
    expect(receipt.normalized_signals).toHaveLength(1);
    expect(receipt.verdict.kind).toBe('safe_silence');
    expect(receipt.verdict.text).toContain('Safe silence');
    expect(receipt.selected_move).toBeNull();
    expect(receipt.safe_silence_reason).toContain('no safe next move');
    expect(receipt.rejected_competing_moves).toEqual([]);
    expect(receipt.context).toContain('Status note recorded; no action requested.');
  });
});
