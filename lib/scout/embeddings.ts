/**
 * Voyage AI embeddings for the Scout Drive index (issue #486).
 *
 * Anthropic has no embeddings API; Voyage is its recommended partner. We use
 * voyage-3.5 at 1024 dimensions (matches scout_drive_chunks.embedding). The
 * VOYAGE_API_KEY is an owner-gated secret read only inside this function — never
 * at module top level. All callers must gate on isScoutEmbeddingsConfigured().
 *
 * input_type asymmetry materially improves retrieval recall: index documents
 * with 'document' and retrieval queries with 'query'.
 */

import { isScoutEmbeddingsConfigured } from '@/lib/config/prelaunch-spend';
import { trackApiCall } from '@/lib/utils/api-tracker';

export const VOYAGE_MODEL = 'voyage-3.5';
export const VOYAGE_DIMENSION = 1024;
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MAX_BATCH = 128;

export type VoyageInputType = 'document' | 'query';

export class EmbeddingsNotConfiguredError extends Error {
  constructor() {
    super('Scout embeddings are not configured (SCOUT_RAG_ENABLED + VOYAGE_API_KEY required)');
    this.name = 'EmbeddingsNotConfiguredError';
  }
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens?: number };
}

async function embedBatch(
  texts: string[],
  inputType: VoyageInputType,
  apiKey: string,
  userId?: string | null,
): Promise<number[][]> {
  const res = await fetch(VOYAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: VOYAGE_DIMENSION,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings failed: ${res.status} ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as VoyageResponse;
  if (!Array.isArray(json.data) || json.data.length !== texts.length) {
    throw new Error(`Voyage returned ${json.data?.length ?? 0} embeddings for ${texts.length} inputs`);
  }

  // Best-effort usage tracking; pricing for voyage-3.5 may not be in the table,
  // which simply yields a $0 estimate — the token count is still recorded.
  const totalTokens = json.usage?.total_tokens ?? 0;
  if (totalTokens > 0) {
    await trackApiCall({
      userId: userId ?? null,
      model: VOYAGE_MODEL,
      inputTokens: totalTokens,
      outputTokens: 0,
      callType: 'scout_embeddings',
    }).catch(() => undefined);
  }

  // Preserve input order (Voyage returns an index per item).
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Embed an ordered list of texts. Batches at VOYAGE_MAX_BATCH. Returns vectors
 * in the same order as the input. Throws EmbeddingsNotConfiguredError when the
 * lane/key is not configured so callers fail loudly rather than silently.
 */
export async function embedTexts(
  texts: string[],
  inputType: VoyageInputType,
  userId?: string | null,
): Promise<number[][]> {
  if (!isScoutEmbeddingsConfigured()) throw new EmbeddingsNotConfiguredError();
  const apiKey = process.env.VOYAGE_API_KEY!.trim();
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_MAX_BATCH) {
    const batch = texts.slice(i, i + VOYAGE_MAX_BATCH);
    out.push(...(await embedBatch(batch, inputType, apiKey, userId)));
  }
  return out;
}

/** Embed a single query string. Convenience for the retrieval path. */
export async function embedQuery(query: string, userId?: string | null): Promise<number[]> {
  const [vector] = await embedTexts([query], 'query', userId);
  return vector;
}
