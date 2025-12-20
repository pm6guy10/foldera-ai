-- Add 'outlook' to work_signals source check constraint
ALTER TABLE work_signals 
  DROP CONSTRAINT IF EXISTS work_signals_source_check;

ALTER TABLE work_signals 
  ADD CONSTRAINT work_signals_source_check 
  CHECK (source IN ('gmail', 'slack', 'linear', 'notion', 'calendar', 'outlook'));

