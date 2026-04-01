import { describe, expect, it } from 'vitest';
import { normalizeMailSubject, parsePrimaryEmail } from '@/lib/sync/derive-mail-intelligence';

describe('derive-mail-intelligence', () => {
  it('normalizes Re:/Fwd: subject lines', () => {
    expect(normalizeMailSubject('Re: Q4 Plan')).toBe('q4 plan');
    expect(normalizeMailSubject('Fwd: RE:  Hello ')).toBe('hello');
  });

  it('parses primary email from display forms', () => {
    expect(parsePrimaryEmail('Jane <jane@example.com>')).toBe('jane@example.com');
    expect(parsePrimaryEmail('bob@test.dev')).toBe('bob@test.dev');
  });
});
