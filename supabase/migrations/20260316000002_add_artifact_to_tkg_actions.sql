-- Add dedicated artifact JSONB column to tkg_actions
-- Previously artifacts were nested inside execution_result; this gives them a first-class column.
ALTER TABLE tkg_actions ADD COLUMN IF NOT EXISTS artifact JSONB DEFAULT NULL;
