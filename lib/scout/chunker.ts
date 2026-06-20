/**
 * Text chunker for the Scout Drive index (issue #486).
 *
 * Splits long document text into overlapping chunks for embedding. Char-based
 * approximation of token budgets (~4 chars/token): ~800-token chunks with
 * ~100-token overlap. Splits on paragraph boundaries where possible, falling
 * back to hard slicing for paragraphs larger than the chunk size.
 */

const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  /** Target chunk size in characters. Default ~800 tokens. */
  maxChars?: number;
  /** Overlap between consecutive chunks in characters. Default ~100 tokens. */
  overlapChars?: number;
}

export const DEFAULT_CHUNK_CHARS = 800 * CHARS_PER_TOKEN; // ~3200
export const DEFAULT_OVERLAP_CHARS = 100 * CHARS_PER_TOKEN; // ~400

/** Hard-slice a single oversized paragraph into <= maxChars windows with overlap. */
function sliceOversized(paragraph: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, maxChars - overlapChars);
  for (let start = 0; start < paragraph.length; start += step) {
    out.push(paragraph.slice(start, start + maxChars));
    if (start + maxChars >= paragraph.length) break;
  }
  return out;
}

/**
 * Chunk text into overlapping windows. Returns [] for empty/whitespace input.
 * Each chunk is non-empty and <= maxChars; consecutive chunks share ~overlapChars
 * of trailing context so a fact split across a boundary is still retrievable.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxChars = Math.max(1, options?.maxChars ?? DEFAULT_CHUNK_CHARS);
  const overlapChars = Math.max(0, Math.min(options?.overlapChars ?? DEFAULT_OVERLAP_CHARS, maxChars - 1));

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    // Seed the next chunk with the overlap tail of the one we just flushed.
    current = overlapChars > 0 && trimmed.length > overlapChars ? trimmed.slice(-overlapChars) : '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      // Oversized paragraph: flush what we have, then hard-slice it.
      if (current.trim()) flush();
      current = '';
      for (const piece of sliceOversized(paragraph, maxChars, overlapChars)) {
        chunks.push(piece);
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      flush();
      current = current ? `${current}\n\n${paragraph}`.trim() : paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
