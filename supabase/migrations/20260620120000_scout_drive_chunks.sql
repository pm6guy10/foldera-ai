-- Scout lane (issue #486): the searchable second brain.
--
-- Stage 0 schema only. This migration is additive and inert until the Scout
-- lane is enabled (SCOUT_RAG_ENABLED) — no product route reads or writes these
-- tables yet. The pgvector extension is already enabled by the original TKG
-- migration (20251221000000); CREATE EXTENSION IF NOT EXISTS is defensive.
--
-- scout_drive_chunks holds chunked, embedded Google Drive content for retrieval.
-- `content` is stored encrypted at rest (same lib/encryption helper as
-- tkg_signals.content); decryption happens only inside the app retrieval path.
-- Embeddings are Voyage voyage-3.5 (1024-dim). user_id is TEXT to match the
-- newest table convention (cost_events) and the user_id::text = auth.uid()::text
-- comparison used by existing RLS.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.scout_drive_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  file_id       TEXT NOT NULL,
  file_name     TEXT,
  mime_type     TEXT,
  web_view_link TEXT,
  modified_time TIMESTAMPTZ,
  chunk_index   INTEGER NOT NULL CHECK (chunk_index >= 0),
  content       TEXT NOT NULL,            -- encrypted at rest (lib/encryption)
  content_hash  TEXT NOT NULL,            -- sha256 of plaintext chunk; idempotent re-index
  embedding     VECTOR(1024) NOT NULL,    -- Voyage voyage-3.5 default dim
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, file_id, chunk_index, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_scout_chunks_user
  ON public.scout_drive_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_scout_chunks_user_file
  ON public.scout_drive_chunks (user_id, file_id);

CREATE INDEX IF NOT EXISTS idx_scout_chunks_embedding
  ON public.scout_drive_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE public.scout_drive_chunks IS
  'Scout lane (issue #486): chunked + embedded Google Drive content for retrieval. content is encrypted at rest. Inert until SCOUT_RAG_ENABLED.';

-- Resumable full-Drive crawl cursor, one row per user.
CREATE TABLE IF NOT EXISTS public.scout_drive_index_state (
  user_id            TEXT PRIMARY KEY,
  drive_page_token   TEXT,                -- Drive files.list / changes.list cursor
  last_full_index_at TIMESTAMPTZ,
  files_indexed      INTEGER NOT NULL DEFAULT 0 CHECK (files_indexed >= 0),
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'complete', 'error')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scout_drive_index_state IS
  'Scout lane (issue #486): resumable full-Drive crawl state, one row per user.';

-- Access control: background/cron writes use service_role; a user may read only
-- their own chunks. Mirrors the cost_events RLS pattern.
REVOKE ALL ON TABLE public.scout_drive_chunks FROM anon, authenticated;
REVOKE ALL ON TABLE public.scout_drive_index_state FROM anon, authenticated;
GRANT ALL ON TABLE public.scout_drive_chunks TO service_role;
GRANT ALL ON TABLE public.scout_drive_index_state TO service_role;

ALTER TABLE public.scout_drive_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_drive_index_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_scout_chunks" ON public.scout_drive_chunks;
CREATE POLICY "service_role_all_scout_chunks" ON public.scout_drive_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "owner_read_scout_chunks" ON public.scout_drive_chunks;
CREATE POLICY "owner_read_scout_chunks" ON public.scout_drive_chunks
  FOR SELECT
  TO authenticated
  USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "service_role_all_scout_index_state" ON public.scout_drive_index_state;
CREATE POLICY "service_role_all_scout_index_state" ON public.scout_drive_index_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Retrieval RPC: cosine nearest-neighbour over one user's chunks. SECURITY
-- DEFINER so service-role background retrieval can run it with a pinned
-- search_path; execute is restricted to service_role per the internal-RPC
-- hardening convention (20260427000000). Returns encrypted content; the app
-- decrypts.
CREATE OR REPLACE FUNCTION public.match_scout_chunks(
  p_user_id          TEXT,
  p_query_embedding  VECTOR(1024),
  p_match_count      INTEGER DEFAULT 8
)
RETURNS TABLE (
  id            UUID,
  file_id       TEXT,
  file_name     TEXT,
  web_view_link TEXT,
  modified_time TIMESTAMPTZ,
  chunk_index   INTEGER,
  content       TEXT,
  similarity    DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.file_id,
    c.file_name,
    c.web_view_link,
    c.modified_time,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.scout_drive_chunks AS c
  WHERE c.user_id = p_user_id
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT GREATEST(p_match_count, 1);
$$;

REVOKE ALL ON FUNCTION public.match_scout_chunks(TEXT, VECTOR(1024), INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_scout_chunks(TEXT, VECTOR(1024), INTEGER) TO service_role;
