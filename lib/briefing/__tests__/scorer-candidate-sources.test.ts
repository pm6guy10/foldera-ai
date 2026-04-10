import { describe, expect, it } from 'vitest';
import {
  commitmentAnchoredToMailSignal,
  isExcludedSignalSourceForScorerPool,
} from '../scorer-candidate-sources';

describe('isExcludedSignalSourceForScorerPool', () => {
  it('excludes calendar-only connector sources', () => {
    expect(isExcludedSignalSourceForScorerPool('outlook_calendar')).toBe(true);
    expect(isExcludedSignalSourceForScorerPool('google_calendar')).toBe(true);
  });

  it('excludes internal Claude conversation signals', () => {
    expect(isExcludedSignalSourceForScorerPool('claude_conversation')).toBe(true);
  });

  it('keeps mail and other sources', () => {
    expect(isExcludedSignalSourceForScorerPool('outlook')).toBe(false);
    expect(isExcludedSignalSourceForScorerPool('gmail')).toBe(false);
    expect(isExcludedSignalSourceForScorerPool(undefined)).toBe(false);
  });
});

describe('commitmentAnchoredToMailSignal', () => {
  it('is true when source_id maps to gmail/outlook signal', () => {
    const m = new Map<string, string>([['sig-1', 'outlook']]);
    expect(commitmentAnchoredToMailSignal('signal_extraction', 'sig-1', m)).toBe(true);
  });

  it('is false when signal row is calendar or missing', () => {
    const m = new Map<string, string>([['sig-1', 'outlook_calendar']]);
    expect(commitmentAnchoredToMailSignal('signal_extraction', 'sig-1', m)).toBe(false);
    expect(commitmentAnchoredToMailSignal('signal_extraction', 'orphan', new Map())).toBe(false);
  });

  it('allows email_analysis provenance', () => {
    const m = new Map<string, string>([['sig-2', 'gmail']]);
    expect(commitmentAnchoredToMailSignal('email_analysis', 'sig-2', m)).toBe(true);
  });
});
