import type Anthropic from '@anthropic-ai/sdk';

const DEFAULT_PROMPT_CACHE_TTL = '5m' as const;

export function buildPromptCachedSystem(
  cacheablePrefix: string,
  dynamicSuffix?: string | null,
  options: {
    ttl?: '5m' | '1h';
  } = {},
): Array<Anthropic.TextBlockParam> {
  const blocks: Array<Anthropic.TextBlockParam> = [
    {
      type: 'text',
      text: cacheablePrefix,
      cache_control: {
        type: 'ephemeral',
        ttl: options.ttl ?? DEFAULT_PROMPT_CACHE_TTL,
      },
    },
  ];

  if (typeof dynamicSuffix === 'string' && dynamicSuffix.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: dynamicSuffix,
    });
  }

  return blocks;
}
