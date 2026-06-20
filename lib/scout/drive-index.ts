/**
 * Scout full-Drive crawl + index (issue #486).
 *
 * Indexes ALL of a user's Drive (no recency filter), one resumable batch per
 * invocation, so a single cron tick stays within maxDuration and the next tick
 * continues from the stored page token. Unlike the Workday Presence sync (which
 * stores 1500-char snippets as throwaway file_modified signals), this pulls full
 * text, chunks it, embeds via Voyage, and stores it as a searchable corpus in
 * scout_drive_chunks.
 *
 * Gated by SCOUT_RAG_ENABLED + a configured Voyage key. Inert otherwise.
 */

import { createHash } from 'crypto';
import { google } from 'googleapis';

import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';
import { getUserToken } from '@/lib/auth/user-tokens';
import { getOAuth2Client } from '@/lib/sync/google-sync';
import { DRIVE_MIME_QUERIES, downloadDriveFileText } from '@/lib/sync/drive-extract';
import { isScoutRagEnabled, isScoutEmbeddingsConfigured } from '@/lib/config/prelaunch-spend';
import { chunkText } from '@/lib/scout/chunker';
import { embedTexts } from '@/lib/scout/embeddings';

/** Full-text cap per file — chunking handles length; bound cost/latency. */
export const SCOUT_MAX_FILE_CHARS = 50_000;
/** Files processed per invocation (cron batch). */
export const SCOUT_DEFAULT_BATCH_SIZE = 100;

export interface DriveIndexResult {
  status: 'skipped' | 'no_token' | 'running' | 'complete' | 'error';
  filesProcessed: number;
  filesSkipped: number;
  chunksUpserted: number;
  done: boolean;
  error?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Index one batch of the user's Drive. Returns done=true when the crawl has no
 * more pages (full pass complete). Safe to call repeatedly (idempotent via the
 * file-level skip check + the chunk UNIQUE constraint).
 */
export async function indexDriveForUser(
  userId: string,
  options?: { batchSize?: number },
): Promise<DriveIndexResult> {
  const empty: DriveIndexResult = {
    status: 'skipped',
    filesProcessed: 0,
    filesSkipped: 0,
    chunksUpserted: 0,
    done: true,
  };

  if (!isScoutRagEnabled() || !isScoutEmbeddingsConfigured()) return empty;

  const token = await getUserToken(userId, 'google');
  if (!token) return { ...empty, status: 'no_token' };

  const batchSize = Math.max(1, options?.batchSize ?? SCOUT_DEFAULT_BATCH_SIZE);
  const supabase = createServerClient();
  const oauth2 = getOAuth2Client(userId, token);
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  // Resume from the stored page token, if any.
  const { data: stateRow } = await supabase
    .from('scout_drive_index_state')
    .select('drive_page_token, files_indexed')
    .eq('user_id', userId)
    .maybeSingle();

  let pageToken: string | undefined = stateRow?.drive_page_token ?? undefined;
  const query = `(${DRIVE_MIME_QUERIES.join(' or ')}) and trashed = false`;

  let filesProcessed = 0;
  let filesSkipped = 0;
  let chunksUpserted = 0;
  let done = false;

  try {
    while (filesProcessed + filesSkipped < batchSize) {
      const res = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, owners, size, webViewLink)',
        pageSize: Math.min(100, batchSize),
        orderBy: 'modifiedTime desc',
        pageToken,
      });

      const files = res.data.files ?? [];
      pageToken = res.data.nextPageToken ?? undefined;

      for (const file of files) {
        if (!file.id) continue;
        const fileId = file.id;
        const mimeType = file.mimeType ?? '';
        const fileName = file.name ?? '(untitled)';
        const modifiedTime = file.modifiedTime ?? null;

        // Skip files already indexed at this modified_time (cheap idempotency).
        const { count } = await supabase
          .from('scout_drive_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('file_id', fileId)
          .eq('modified_time', modifiedTime);
        if ((count ?? 0) > 0) {
          filesSkipped++;
          continue;
        }

        const text = await downloadDriveFileText(drive, fileId, mimeType, fileName, {
          maxChars: SCOUT_MAX_FILE_CHARS,
          fileSize: file.size ? Number(file.size) : undefined,
        });
        if (!text || !text.trim()) {
          filesSkipped++;
          continue;
        }

        const chunks = chunkText(text);
        if (chunks.length === 0) {
          filesSkipped++;
          continue;
        }

        const embeddings = await embedTexts(chunks, 'document', userId);

        const rows = chunks.map((chunk, index) => ({
          user_id: userId,
          file_id: fileId,
          file_name: fileName,
          mime_type: mimeType,
          web_view_link: file.webViewLink ?? null,
          modified_time: modifiedTime,
          chunk_index: index,
          content: encrypt(chunk),
          content_hash: sha256(chunk),
          embedding: embeddings[index],
        }));

        const { error } = await supabase
          .from('scout_drive_chunks')
          .upsert(rows, { onConflict: 'user_id,file_id,chunk_index,content_hash', ignoreDuplicates: true });
        if (error) {
          console.warn(`[scout-index] upsert failed for ${fileId}:`, error.message);
          filesSkipped++;
          continue;
        }

        filesProcessed++;
        chunksUpserted += rows.length;
        if (filesProcessed + filesSkipped >= batchSize) break;
      }

      if (!pageToken) {
        done = true;
        break;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('insufficientPermissions') || (err as { code?: number })?.code === 403) {
      console.warn('[scout-index] drive.readonly scope not granted; skipping');
      return { ...empty, status: 'skipped' };
    }
    await persistState(supabase, userId, pageToken, filesProcessed, 'error', done);
    return { status: 'error', filesProcessed, filesSkipped, chunksUpserted, done: false, error: message };
  }

  await persistState(supabase, userId, pageToken, filesProcessed, done ? 'complete' : 'running', done);

  return {
    status: done ? 'complete' : 'running',
    filesProcessed,
    filesSkipped,
    chunksUpserted,
    done,
  };
}

async function persistState(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  pageToken: string | undefined,
  newlyIndexed: number,
  status: string,
  done: boolean,
): Promise<void> {
  const { data: existing } = await supabase
    .from('scout_drive_index_state')
    .select('files_indexed')
    .eq('user_id', userId)
    .maybeSingle();
  const filesIndexed = (existing?.files_indexed ?? 0) + newlyIndexed;

  await supabase.from('scout_drive_index_state').upsert(
    {
      user_id: userId,
      drive_page_token: done ? null : pageToken ?? null,
      files_indexed: filesIndexed,
      status,
      updated_at: new Date().toISOString(),
      ...(done ? { last_full_index_at: new Date().toISOString() } : {}),
    },
    { onConflict: 'user_id' },
  );
}
