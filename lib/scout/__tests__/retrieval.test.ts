import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/prelaunch-spend', () => ({
  isScoutRagEnabled: vi.fn(() => true),
}));
vi.mock('@/lib/scout/embeddings', () => ({
  embedQuery: vi.fn(async () => Array.from({ length: 1024 }, () => 0.1)),
}));

const rpc = vi.fn();
vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({ rpc }),
}));

import { retrieveDriveContext } from '../retrieval';
import { isScoutRagEnabled } from '@/lib/config/prelaunch-spend';
import { encrypt } from '@/lib/encryption';

const mockedRag = vi.mocked(isScoutRagEnabled);

describe('retrieveDriveContext', () => {
  beforeEach(() => {
    mockedRag.mockReturnValue(true);
    rpc.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns [] when the RAG lane is disabled', async () => {
    mockedRag.mockReturnValue(false);
    expect(await retrieveDriveContext('u1', 'query')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns [] for an empty query', async () => {
    expect(await retrieveDriveContext('u1', '   ')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('decrypts readable rows and passes plaintext rows through, skipping ciphertext', async () => {
    rpc.mockResolvedValue({
      data: [
        // 1) properly encrypted, readable
        {
          id: '1', file_id: 'f1', file_name: 'resume.docx', web_view_link: 'http://x/1',
          modified_time: '2026-01-01T00:00:00Z', chunk_index: 0,
          content: encrypt('Software engineer, 8 years experience'), similarity: 0.92,
        },
        // 2) legacy plaintext (not base64-looking) -> kept verbatim (#481 rule)
        {
          id: '2', file_id: 'f2', file_name: 'note.md', web_view_link: null,
          modified_time: null, chunk_index: 0,
          content: 'Plain readable note with spaces.', similarity: 0.80,
        },
        // 3) undecryptable ciphertext (long, pure base64) -> skipped
        {
          id: '3', file_id: 'f3', file_name: 'x', web_view_link: null,
          modified_time: null, chunk_index: 0,
          content: 'A'.repeat(120), similarity: 0.70,
        },
      ],
      error: null,
    });

    const results = await retrieveDriveContext('u1', 'my background', 5);

    expect(rpc).toHaveBeenCalledWith('match_scout_chunks', {
      p_user_id: 'u1',
      p_query_embedding: expect.any(Array),
      p_match_count: 5,
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      fileId: 'f1', fileName: 'resume.docx', content: 'Software engineer, 8 years experience', similarity: 0.92,
    });
    expect(results[1]).toMatchObject({ fileId: 'f2', content: 'Plain readable note with spaces.' });
  });

  it('returns [] when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await retrieveDriveContext('u1', 'q')).toEqual([]);
  });
});
