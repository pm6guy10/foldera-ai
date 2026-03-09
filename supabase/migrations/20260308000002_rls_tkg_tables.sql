-- RLS: Lock down all tkg_ tables
-- The app uses NextAuth (not Supabase Auth), so auth.uid() is not in use.
-- Service role key (used by the app server) bypasses RLS automatically.
-- Public / anon access must be fully denied.
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → Run).

ALTER TABLE tkg_entities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkg_signals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkg_commitments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkg_briefings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkg_conflicts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tkg_feedback     ENABLE ROW LEVEL SECURITY;

-- Deny all public (anon + authenticated JWT) access.
-- Service role bypasses RLS entirely — no policy needed for it.

CREATE POLICY "deny_all_public" ON tkg_entities     AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
CREATE POLICY "deny_all_public" ON tkg_signals      AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
CREATE POLICY "deny_all_public" ON tkg_commitments  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
CREATE POLICY "deny_all_public" ON tkg_briefings    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
CREATE POLICY "deny_all_public" ON tkg_conflicts    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
CREATE POLICY "deny_all_public" ON tkg_feedback     AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
