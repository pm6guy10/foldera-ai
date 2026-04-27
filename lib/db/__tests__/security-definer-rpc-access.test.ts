import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260427000000_restrict_internal_security_definer_rpcs.sql',
);
const migrationSql = readFileSync(migrationPath, 'utf8');

const INTERNAL_RPC_SIGNATURES = [
  'public.get_auth_user_id_by_email(text)',
  'public.replace_onboarding_goals(uuid, jsonb)',
  'public.replace_current_priorities(uuid, jsonb)',
  'public.apply_commitment_ceiling(integer)',
  'public.api_budget_check_and_reserve(integer)',
  'public.api_budget_record_actual(integer)',
];

describe('security definer RPC execute grants', () => {
  it('revokes anon/authenticated/public execute and preserves service_role for internal RPCs', () => {
    for (const signature of INTERNAL_RPC_SIGNATURES) {
      expect(migrationSql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`);
      expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });
});
