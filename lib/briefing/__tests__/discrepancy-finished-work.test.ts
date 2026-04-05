import { describe, it, expect } from 'vitest';
import { looksLikeDiscrepancyTriageOrChoreList } from '../discrepancy-finished-work';

describe('looksLikeDiscrepancyTriageOrChoreList', () => {
  it('flags two chore numbered lines', () => {
    const t = `Directive here.\n\n1. Complete Teladoc survey before Friday.\n2. Schedule Chase payment online.\n`;
    expect(looksLikeDiscrepancyTriageOrChoreList(t)).toBe(true);
  });

  it('flags suggested approach with one chore line', () => {
    const t = `Pattern: inbox pile-up.\n\nSuggested approach:\n1. Review each vendor email and respond.\n`;
    expect(looksLikeDiscrepancyTriageOrChoreList(t)).toBe(true);
  });

  it('does not flag a single drafted reply block', () => {
    const t =
      `You have 3 threads from Pat.\n\n` +
      `--- Reply 1 ---\nSubject: Re: Roadmap\n\nHi Pat,\n\nThanks for your questions on the roadmap. Here are the dates we discussed...\n`;
    expect(looksLikeDiscrepancyTriageOrChoreList(t)).toBe(false);
  });

  it('does not flag numbered replies (Reply is not a chore verb)', () => {
    const t =
      `1. Reply to Pat:\n\nHi Pat,\n\nFollowing up on the roadmap.\n\n` +
      `2. Reply to Jordan:\n\nHi Jordan,\n\nConfirming Tuesday works.\n`;
    expect(looksLikeDiscrepancyTriageOrChoreList(t)).toBe(false);
  });

  it('returns false for short text', () => {
    expect(looksLikeDiscrepancyTriageOrChoreList('short')).toBe(false);
  });
});
