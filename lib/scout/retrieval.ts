/**
 * Scout Drive retrieval (issue #486).
 *
 * retrieveDriveContext embeds the query, runs a cosine nearest-neighbour search
 * over the user's scout_drive_chunks via the match_scout_chunks RPC, and
 * decrypts the stored content. This is the bridge that turns the user's whole
 * Drive into a searchable second brain — used by both the enriched brief
 * (Stage 2) and the proactive scout loop (Stage 3).
 *
 * Gated by SCOUT_RAG_ENABLED; returns [] when the lane is off so callers can
 * wire it in unconditionally without changing default behavior.
 */

import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus, looksLikeEncryptedPayload } from '@/lib/encryption';
import { isScoutRagEnabled } from '@/lib/config/prelaunch-spend';
import { embedQuery } from '@/lib/scout/embeddings';

export interface DriveContextChunk {
  fileId: string;
  fileName: string | null;
  webViewLink: string | null;
  modifiedTime: string | null;
  content: string;
  similarity: number;
}

interface MatchScoutChunkRow {
  id: string;
  file_id: string;
  file_name: string | null;
  web_view_link: string | null;
  modified_time: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
}

export const DEFAULT_RETRIEVAL_K = 8;

/**
 * Retrieve the k most relevant Drive chunks for a query. Decrypts content,
 * skipping only genuinely-unreadable ciphertext (the #481 FORMAT-GAP rule).
 */
export async function retrieveDriveContext(
  userId: string,
  query: string,
  k: number = DEFAULT_RETRIEVAL_K,
): Promise<DriveContextChunk[]> {
  if (!isScoutRagEnabled()) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryEmbedding = await embedQuery(trimmed, userId);

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('match_scout_chunks', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_match_count: Math.max(1, k),
  });

  if (error) {
    console.warn('[scout-retrieval] match_scout_chunks failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as MatchScoutChunkRow[];
  const results: DriveContextChunk[] = [];

  for (const row of rows) {
    const { plaintext, usedFallback } = decryptWithStatus(row.content);
    // Drop only true undecryptable ciphertext; readable plaintext flows through.
    if (usedFallback && looksLikeEncryptedPayload(row.content)) continue;

    results.push({
      fileId: row.file_id,
      fileName: row.file_name,
      webViewLink: row.web_view_link,
      modifiedTime: row.modified_time,
      content: plaintext,
      similarity: typeof row.similarity === 'number' ? row.similarity : 0,
    });
  }

  return results;
}
