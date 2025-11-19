-- =====================================================
-- FOLDERA WAITLIST TABLE
-- Stores early-bird waitlist signups
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: waitlist
-- Stores waitlist signups with pricing lock
-- =====================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Contact info
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  
  -- Pricing
  early_bird_pricing BOOLEAN DEFAULT true,
  tier VARCHAR DEFAULT 'professional',
  committed_price DECIMAL DEFAULT 47.00,
  pricing_locked_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast email lookups
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API)
CREATE POLICY "Service role has full access to waitlist" ON waitlist
  FOR ALL TO service_role USING (true);

-- Public can insert (for waitlist form)
CREATE POLICY "Anyone can sign up for waitlist" ON waitlist
  FOR INSERT TO anon WITH CHECK (true);

-- =====================================================
-- END OF MIGRATION
-- =====================================================

COMMENT ON TABLE waitlist IS 'Early-bird waitlist signups with locked pricing';


