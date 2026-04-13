import { describe, expect, it } from 'vitest';
import { reorderRankedCandidatesForVerificationGoldenPathWriteDocument } from '@/lib/briefing/generator';

describe('reorderRankedCandidatesForVerificationGoldenPathWriteDocument', () => {
  it('moves schedule_conflict discrepancy candidates to the front', () => {
    const a = {
      candidate: { id: 'a', type: 'signal', discrepancyClass: null },
      disqualified: false,
    };
    const b = {
      candidate: { id: 'b', type: 'discrepancy', discrepancyClass: 'schedule_conflict' },
      disqualified: false,
    };
    const c = {
      candidate: { id: 'c', type: 'discrepancy', discrepancyClass: 'decay' },
      disqualified: false,
    };
    const out = reorderRankedCandidatesForVerificationGoldenPathWriteDocument([a, b, c]);
    expect(out.map((x) => x.candidate.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns the original order when no schedule_conflict or stale_document discrepancy exists', () => {
    const ranked = [
      { candidate: { id: 'x', type: 'discrepancy', discrepancyClass: 'decay' }, disqualified: false },
      { candidate: { id: 'y', type: 'signal', discrepancyClass: null }, disqualified: false },
    ];
    expect(reorderRankedCandidatesForVerificationGoldenPathWriteDocument(ranked)).toEqual(ranked);
  });

  it('moves stale_document discrepancy candidates after schedule_conflict when both exist', () => {
    const decay = {
      candidate: { id: 'd', type: 'discrepancy', discrepancyClass: 'decay' },
      disqualified: false,
    };
    const stale = {
      candidate: { id: 's', type: 'discrepancy', discrepancyClass: 'stale_document' },
      disqualified: false,
    };
    const sched = {
      candidate: { id: 'c', type: 'discrepancy', discrepancyClass: 'schedule_conflict' },
      disqualified: false,
    };
    const out = reorderRankedCandidatesForVerificationGoldenPathWriteDocument([decay, stale, sched]);
    expect(out.map((x) => x.candidate.id)).toEqual(['c', 's', 'd']);
  });

  it('promotes stale_document to the front when schedule_conflict is absent', () => {
    const a = { candidate: { id: 'a', type: 'signal', discrepancyClass: null }, disqualified: false };
    const stale = {
      candidate: { id: 's', type: 'discrepancy', discrepancyClass: 'stale_document' },
      disqualified: false,
    };
    const out = reorderRankedCandidatesForVerificationGoldenPathWriteDocument([a, stale]);
    expect(out.map((x) => x.candidate.id)).toEqual(['s', 'a']);
  });

  it('does not promote disqualified schedule_conflict rows', () => {
    const b = {
      candidate: { id: 'b', type: 'discrepancy', discrepancyClass: 'schedule_conflict' },
      disqualified: true,
    };
    const a = {
      candidate: { id: 'a', type: 'signal', discrepancyClass: null },
      disqualified: false,
    };
    const out = reorderRankedCandidatesForVerificationGoldenPathWriteDocument([a, b]);
    expect(out.map((x) => x.candidate.id)).toEqual(['a', 'b']);
  });
});
