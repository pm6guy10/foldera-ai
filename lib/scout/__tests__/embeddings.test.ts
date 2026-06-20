import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/prelaunch-spend', () => ({
  isScoutEmbeddingsConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: vi.fn(async () => undefined),
}));

import { embedTexts, embedQuery, EmbeddingsNotConfiguredError, VOYAGE_DIMENSION } from '../embeddings';
import { isScoutEmbeddingsConfigured } from '@/lib/config/prelaunch-spend';

const mockedConfigured = vi.mocked(isScoutEmbeddingsConfigured);

function voyageResponse(count: number, shuffle = false) {
  const data = Array.from({ length: count }, (_, i) => ({
    index: i,
    embedding: Array.from({ length: VOYAGE_DIMENSION }, () => i / 100),
  }));
  if (shuffle) data.reverse(); // simulate out-of-order return
  return { ok: true, json: async () => ({ data, usage: { total_tokens: count * 10 } }) };
}

describe('embeddings', () => {
  beforeEach(() => {
    mockedConfigured.mockReturnValue(true);
    vi.stubEnv('VOYAGE_API_KEY', 'voyage-test-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws when not configured', async () => {
    mockedConfigured.mockReturnValue(false);
    await expect(embedTexts(['a'], 'document')).rejects.toBeInstanceOf(EmbeddingsNotConfiguredError);
  });

  it('returns [] for empty input without calling Voyage', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(await embedTexts([], 'document')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves input order even when Voyage returns shuffled indices', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(voyageResponse(3, true) as unknown as Response);
    const vectors = await embedTexts(['a', 'b', 'c'], 'document');
    expect(vectors).toHaveLength(3);
    expect(vectors[0][0]).toBe(0);
    expect(vectors[1][0]).toBe(1 / 100);
    expect(vectors[2][0]).toBe(2 / 100);
  });

  it('batches inputs larger than the Voyage max batch', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse((init as RequestInit).body as string);
        return voyageResponse(body.input.length) as unknown as Response;
      });
    const vectors = await embedTexts(Array.from({ length: 200 }, (_, i) => `t${i}`), 'document');
    expect(vectors).toHaveLength(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 128 + 72
  });

  it('throws on a non-ok Voyage response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' } as unknown as Response);
    await expect(embedTexts(['a'], 'document')).rejects.toThrow(/Voyage embeddings failed: 429/);
  });

  it('embedQuery returns a single vector', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(voyageResponse(1) as unknown as Response);
    const vec = await embedQuery('what is my runway');
    expect(vec).toHaveLength(VOYAGE_DIMENSION);
  });
});
