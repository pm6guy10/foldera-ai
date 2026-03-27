-- Cleanup malformed auto-suppression goals created by the old n-gram fallback
-- in extractDirectiveEntity(). These goals contain garbage entity keys like
-- "anthropicapikey", "a 30", "your stated top goal", "sorry mother", etc.
-- They poisoned the suppression list and caused real directives to be filtered.
--
-- Rules for a VALID auto-suppression goal_text:
--   "AUTO-SUPPRESSED: <entity>. Skipped 3+ times..."
-- A valid entity must:
--   - Be at least 3 characters
--   - Contain at least one uppercase letter (proper noun)
--   - Not be longer than 60 characters
--   - Not match known pollution-era patterns
--
-- We delete goals that fail any of these checks.

DELETE FROM tkg_goals
WHERE source = 'auto_suppression'
  AND (
    -- Entity extracted from goal_text is too short or missing
    length(
      regexp_replace(goal_text, E'^AUTO-SUPPRESSED:\\s*(.+?)\\..*$', '\\1', 'i')
    ) < 3

    OR

    -- Entity is longer than 60 chars (multi-sentence garbage)
    length(
      regexp_replace(goal_text, E'^AUTO-SUPPRESSED:\\s*(.+?)\\..*$', '\\1', 'i')
    ) > 60

    OR

    -- Entity has no uppercase letter (not a proper noun — n-gram fragments are all lowercase)
    regexp_replace(goal_text, E'^AUTO-SUPPRESSED:\\s*(.+?)\\..*$', '\\1', 'i')
      NOT SIMILAR TO '%[A-Z]%'

    OR

    -- Known pollution-era garbage patterns
    goal_text ~* 'anthropic|apikey|your stated|acknowledge that|commitment system|sorry mother|sorry\s+\w+er|\ba \d+\b|\bfor \d+\b'
  );
