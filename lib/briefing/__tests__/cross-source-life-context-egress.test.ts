import { beforeEach, describe, expect, it, vi } from 'vitest';

const inCalls: Array<{ field: string; values: string[] }> = [];
const limitCalls: number[] = [];

function makeSignalsQuery() {
  const builder = {
    eq() { return builder; },
    gte() { return builder; },
    in(field: string, values: string[]) {
      inCalls.push({ field, values });
      return builder;
    },
    order() { return builder; },
    limit(value: number) {
      limitCalls.push(value);
      return Promise.resolve({ data: [], error: null });
    },
  };

  return {
    select() {
      return builder;
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'tkg_signals') {
        throw new Error(`Unexpected table ${table}`);
      }

      return makeSignalsQuery();
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: (_value: unknown) => ({ plaintext: String(_value), usedFallback: false }),
}));

import {
  appendCrossSourceLifeContextSnippets,
  CROSS_SOURCE_LIFE_CONTEXT_SOURCES,
} from '../generator';

describe('appendCrossSourceLifeContextSnippets query scope', () => {
  beforeEach(() => {
    inCalls.length = 0;
    limitCalls.length = 0;
  });

  it('limits Supabase reads to non-email life-context sources', async () => {
    const existing = [];

    const out = await appendCrossSourceLifeContextSnippets('user-1', existing);

    expect(out).toEqual(existing);
    expect(inCalls).toHaveLength(1);
    expect(limitCalls).toEqual([84]);
    expect(inCalls[0]).toEqual({
      field: 'source',
      values: CROSS_SOURCE_LIFE_CONTEXT_SOURCES,
    });
    expect(CROSS_SOURCE_LIFE_CONTEXT_SOURCES).not.toContain('gmail');
    expect(CROSS_SOURCE_LIFE_CONTEXT_SOURCES).not.toContain('outlook');
  });
});
