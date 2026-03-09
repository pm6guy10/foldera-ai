-- Waitlist table: ensure minimal schema exists and lock down RLS to match
-- the deny-all pattern used on tkg_ tables (service role bypasses RLS).
--
-- The table may already exist from earlier migrations with extra columns
-- (name, early_bird_pricing, tier, committed_price, pricing_locked_at).
-- Those columns are left intact; we only add what is missing.
--
-- Run in: Supabase Dashboard → SQL Editor → Run

-- Ensure the table exists with at minimum the three required columns.
CREATE TABLE IF NOT EXISTS waitlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (idempotent if already enabled).
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Drop the old permissive policies created by earlier migrations.
DROP POLICY IF EXISTS "Allow public inserts"                  ON waitlist;
DROP POLICY IF EXISTS "Allow service role all access"         ON waitlist;
DROP POLICY IF EXISTS "Service role has full access to waitlist" ON waitlist;
DROP POLICY IF EXISTS "Anyone can sign up for waitlist"       ON waitlist;

-- Deny all public (anon + authenticated JWT) access.
-- Service role (used by the app server) bypasses RLS automatically —
-- no explicit policy is needed for it.
CREATE POLICY "deny_all_public" ON waitlist
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
