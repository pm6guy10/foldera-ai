import { describe, it, expect } from 'vitest';
import { extractEmailsFromText } from '../entity-attention-runtime';

describe('entity-attention-runtime', () => {
  it('extractEmailsFromText dedupes and skips foldera.ai', () => {
    expect(extractEmailsFromText('Talk to a@b.com and A@B.COM')).toEqual(['a@b.com']);
    expect(extractEmailsFromText('brief@foldera.ai only')).toEqual([]);
    expect(extractEmailsFromText('noreply@foldera.ai only')).toEqual([]);
  });
});
