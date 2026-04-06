import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '../generator';

/** Legacy few-shot identifiers removed in diagnostician hardening — must not reappear in SYSTEM_PROMPT. */
const BANNED_LEGACY_MARKERS = [
  'DSHS',
  'Yadira',
  'Jordan Miles',
  'Holly Stenglein',
  'Marissa',
  'Teo,',
  'Teo (',
  'ESD overpayment',
  'Alex Morgan',
  'Jordan Lee',
  'Cloud Storage:',
  '800-318-6022',
];

describe('SYSTEM_PROMPT hygiene', () => {
  it('contains diagnostician framing', () => {
    expect(SYSTEM_PROMPT).toContain('OBSERVATION VS DIAGNOSIS');
    expect(SYSTEM_PROMPT).toContain('DOMAIN DIAGNOSTIC LENSES');
    expect(SYSTEM_PROMPT).toContain('NAMED FAILURE MODES');
    expect(SYSTEM_PROMPT).toContain('DIAGNOSTIC_LENS');
    expect(SYSTEM_PROMPT).toContain('MISSING DETAILS — NEVER BRACKET FILL-INS');
    expect(SYSTEM_PROMPT).toContain('[INSERT DATE]');
    expect(SYSTEM_PROMPT).toContain('WRITE_DOCUMENT — SIGNAL-GROUNDED VALUES');
    expect(SYSTEM_PROMPT).toContain('You are not a task manager');
  });

  it('does not contain legacy real-style few-shot names or entities', () => {
    for (const marker of BANNED_LEGACY_MARKERS) {
      expect(SYSTEM_PROMPT, `banned marker leaked: ${marker}`).not.toContain(marker);
    }
  });
});
