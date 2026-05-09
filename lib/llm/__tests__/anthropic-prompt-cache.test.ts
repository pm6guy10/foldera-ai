import { describe, expect, it } from 'vitest';

import { buildPromptCachedSystem } from '../anthropic-prompt-cache';

describe('buildPromptCachedSystem', () => {
  it('returns one cached system block when only the reusable prefix is provided', () => {
    expect(buildPromptCachedSystem('Static instructions only')).toEqual([
      {
        type: 'text',
        text: 'Static instructions only',
        cache_control: {
          type: 'ephemeral',
          ttl: '5m',
        },
      },
    ]);
  });

  it('keeps the reusable prefix cached and appends uncached dynamic suffix text', () => {
    expect(
      buildPromptCachedSystem('Reusable instructions', 'Context: user-specific details'),
    ).toEqual([
      {
        type: 'text',
        text: 'Reusable instructions',
        cache_control: {
          type: 'ephemeral',
          ttl: '5m',
        },
      },
      {
        type: 'text',
        text: 'Context: user-specific details',
      },
    ]);
  });

  it('drops blank dynamic suffix text', () => {
    expect(buildPromptCachedSystem('Reusable instructions', '   ')).toEqual([
      {
        type: 'text',
        text: 'Reusable instructions',
        cache_control: {
          type: 'ephemeral',
          ttl: '5m',
        },
      },
    ]);
  });
});
