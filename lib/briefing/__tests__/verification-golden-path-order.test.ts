import { describe, expect, it } from 'vitest';
import { reorderRankedCandidatesForVerificationGoldenPathWriteDocument } from '@/lib/briefing/generator';

describe('reorderRankedCandidatesForVerificationGoldenPathWriteDocument', () => {
  it('does not promote schedule_conflict discrepancy candidates ahead of the original order', () => {
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
    expect(out.map((x) => x.candidate.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the original order when no schedule_conflict or stale_document discrepancy exists', () => {
    const ranked = [
      { candidate: { id: 'x', type: 'discrepancy', discrepancyClass: 'decay' }, disqualified: false },
      { candidate: { id: 'y', type: 'signal', discrepancyClass: null }, disqualified: false },
    ];
    expect(reorderRankedCandidatesForVerificationGoldenPathWriteDocument(ranked)).toEqual(ranked);
  });

  it('promotes stale_document while leaving schedule_conflict in place when both exist', () => {
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
    expect(out.map((x) => x.candidate.id)).toEqual(['s', 'd', 'c']);
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
