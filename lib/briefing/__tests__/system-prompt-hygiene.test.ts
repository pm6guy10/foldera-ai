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

/** Scorer/engine meta-terms the new prompt explicitly forbids the LLM from echoing. */
const BANNED_META_TERMS = [
  'OBSERVATION VS DIAGNOSIS',
  'DOMAIN DIAGNOSTIC LENSES',
  'NAMED FAILURE MODES',
  'DIAGNOSTIC_LENS',
  'PASSIVE SUMMARY BAN',
  'GOAL DECAY / BANDWIDTH RULE',
  'SEND_MESSAGE CONTRACT',
  'WRITE_DOCUMENT CONTRACT',
];

describe('SYSTEM_PROMPT hygiene', () => {
  it('instructs the LLM to deliver finished work in one of two shapes', () => {
    expect(SYSTEM_PROMPT).toContain('You are Foldera');
    expect(SYSTEM_PROMPT).toContain('Finished work means');
    expect(SYSTEM_PROMPT).toContain('SHAPE A — send_message');
    expect(SYSTEM_PROMPT).toContain('SHAPE B — write_document');
    expect(SYSTEM_PROMPT).toContain('Cite real sources');
    expect(SYSTEM_PROMPT).toContain('No meta-commentary');
    expect(SYSTEM_PROMPT).toContain('No suggestions');
    expect(SYSTEM_PROMPT).toContain('No task lists addressed to the user');
    expect(SYSTEM_PROMPT).toContain('No padding');
    expect(SYSTEM_PROMPT).toContain("Match the user's voice");
    expect(SYSTEM_PROMPT).toContain('Return ONLY a JSON object');
    expect(SYSTEM_PROMPT).toContain('"action_type"');
    expect(SYSTEM_PROMPT).toContain('"directive_text"');
    expect(SYSTEM_PROMPT).toContain('"artifact"');
  });

  it('does not contain legacy real-style few-shot names or entities', () => {
    for (const marker of BANNED_LEGACY_MARKERS) {
      expect(SYSTEM_PROMPT, `banned marker leaked: ${marker}`).not.toContain(marker);
    }
  });

  it('does not re-introduce scorer/engine meta-term sections the new prompt removes', () => {
    for (const term of BANNED_META_TERMS) {
      expect(SYSTEM_PROMPT, `meta-term leaked back in: ${term}`).not.toContain(term);
    }
  });
});
