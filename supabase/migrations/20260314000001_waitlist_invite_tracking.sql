-- Add invite tracking columns to the waitlist table.
-- invited_at: set when the conversion invite email is sent.
-- invite_opened_at: set when the recipient opens the invite email.

ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS invited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_opened_at  TIMESTAMPTZ;
