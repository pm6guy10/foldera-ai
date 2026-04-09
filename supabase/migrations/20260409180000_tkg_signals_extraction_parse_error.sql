-- Record unrecoverable batch JSON parse failures while still marking signals processed
-- so extraction backlog cannot stall the pipeline indefinitely.

ALTER TABLE public.tkg_signals
  ADD COLUMN IF NOT EXISTS extraction_parse_error text;

COMMENT ON COLUMN public.tkg_signals.extraction_parse_error IS
  'When set, Haiku returned extraction output that could not be parsed; row was marked processed=true to unblock backlog.';
