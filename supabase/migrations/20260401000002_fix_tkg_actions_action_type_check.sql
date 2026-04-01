-- Align tkg_actions.action_type CHECK with generator/scorer outputs:
-- allow schedule_block and wait_rationale (artifact-aligned names) alongside legacy schedule.

ALTER TABLE tkg_actions DROP CONSTRAINT IF EXISTS tkg_actions_action_type_check;

ALTER TABLE tkg_actions ADD CONSTRAINT tkg_actions_action_type_check CHECK (
  action_type IN (
    'send_message',
    'write_document',
    'schedule',
    'schedule_block',
    'do_nothing',
    'make_decision',
    'research',
    'wait_rationale'
  )
);
