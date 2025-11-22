-- =====================================================
-- FIX: Update Context Engine Foreign Key
-- Fixes work_signals.user_id to reference meeting_prep_users instead of auth.users
-- =====================================================

-- Drop the old foreign key constraint if it exists
ALTER TABLE work_signals 
  DROP CONSTRAINT IF EXISTS work_signals_user_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE work_signals 
  ADD CONSTRAINT work_signals_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES meeting_prep_users(id) 
  ON DELETE CASCADE;

