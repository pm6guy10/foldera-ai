import { describe, expect, it } from 'vitest';
import {
  filterPersonNamesForValidityContext,
  VALIDITY_CONTEXT_ENTITY_STOPWORDS,
} from '../validity-context-entity';

describe('filterPersonNamesForValidityContext', () => {
  it('removes production false-positive tokens', () => {
    const out = filterPersonNamesForValidityContext([
      'Reference',
      'Complete',
      'Health',
      'Last',
      'Skipped',
      'From',
      'Start',
      'Available',
    ]);
    expect(out).toEqual([]);
  });

  it('keeps real person names', () => {
    expect(
      filterPersonNamesForValidityContext([
        'Brandon Kapp',
        'keri nopens',
        'Nicole Vreeland',
        'Jim Dunivan',
      ]),
    ).toEqual(['Brandon Kapp', 'keri nopens', 'Nicole Vreeland', 'Jim Dunivan']);
  });

  it('drops stopword first token on multi-word junk', () => {
    expect(filterPersonNamesForValidityContext(['Reference Checks'])).toEqual([]);
  });

  it('removes Financial / Personal mis-extractions (rejection gate false positives)', () => {
    expect(filterPersonNamesForValidityContext(['Financial', 'Personal'])).toEqual([]);
  });

  it('stopword set is lowercase for lookup', () => {
    expect(VALIDITY_CONTEXT_ENTITY_STOPWORDS.has('reference')).toBe(true);
    expect(VALIDITY_CONTEXT_ENTITY_STOPWORDS.has('Reference')).toBe(false);
  });
});
