import { describe, expect, it } from 'vitest';
import { hasBracketTemplatePlaceholder } from '../bracket-placeholder';

describe('hasBracketTemplatePlaceholder', () => {
  it('flags template slots and insert-style brackets', () => {
    expect(hasBracketTemplatePlaceholder('Reply to [name] about the offer')).toBe(true);
    expect(hasBracketTemplatePlaceholder('Subject: [INSERT DATE] follow-up')).toBe(true);
    expect(hasBracketTemplatePlaceholder('Memo [YOUR NAME]')).toBe(true);
    expect(hasBracketTemplatePlaceholder('See [placeholder] here')).toBe(true);
    expect(hasBracketTemplatePlaceholder('Due [TBD]')).toBe(true);
    expect(hasBracketTemplatePlaceholder('x [FILL HERE] y')).toBe(true);
  });

  it('allows real names and short acronyms in brackets (golden-path titles)', () => {
    expect(hasBracketTemplatePlaceholder('[Nicole Vreeland] — interview thread')).toBe(false);
    expect(hasBracketTemplatePlaceholder('Offer from [HCA] recruiting')).toBe(false);
    expect(hasBracketTemplatePlaceholder('Attach [PDF] summary')).toBe(false);
    expect(hasBracketTemplatePlaceholder('Ref: [US] payroll')).toBe(false);
  });

  it('flags multi-word ALL_CAPS template phrases in brackets', () => {
    expect(hasBracketTemplatePlaceholder('x [INSERT DATE] y')).toBe(true);
    expect(hasBracketTemplatePlaceholder('[DUE DATE]')).toBe(true);
  });
});
