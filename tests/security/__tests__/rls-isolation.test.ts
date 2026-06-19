import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pass 1 (Master Audit #445) — cross-tenant isolation contract.
 *
 * This is the regression guard the audit's acceptance criterion asked for:
 * "a cross-tenant leak test exists and passes." Supabase's JS client cannot read
 * pg_catalog (no SQL surface) and CI has no database, so this test instead asserts
 * the isolation INVARIANTS over a committed snapshot of the live RLS policy state
 * (tests/security/rls-policy-snapshot.json, generated read-only from production).
 *
 * The live read-only proof was performed during the Pass 1 session and is recorded
 * in docs/security/RLS_ISOLATION.md. This test makes that proof durable: regenerate
 * the snapshot after any RLS migration (the docs name the exact query), and these
 * invariants fail loudly if a migration ever opens a cross-tenant path or adds an
 * un-classified table.
 */

interface Policy {
  name: string;
  permissive: 'PERMISSIVE' | 'RESTRICTIVE';
  roles: string[];
  cmd: string;
  qual_has_auth_uid: boolean;
  qual_is_false: boolean;
}
interface TableSnapshot {
  table: string;
  rls_enabled: boolean;
  policies: Policy[];
}
interface Snapshot {
  tables: TableSnapshot[];
}

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  readFileSync(join(here, '..', 'rls-policy-snapshot.json'), 'utf8'),
) as Snapshot;

/** Tables a logged-in user reads directly (anon/authenticated client). Each MUST keep a per-user auth.uid() policy. */
const DIRECT_USER_READ_TABLES = [
  'api_usage',
  'signal_summaries',
  'tkg_actions',
  'tkg_briefings',
  'tkg_commitments',
  'tkg_conflicts',
  'tkg_entities',
  'tkg_feedback',
  'tkg_goals',
  'tkg_pattern_metrics',
  'tkg_signals',
  'tkg_user_meta',
  'user_tokens',
] as const;

/** Tables reachable ONLY via the server (service_role). No direct public/authenticated read path allowed. */
const SERVICE_ONLY_TABLES = [
  'api_budget',
  'cost_events',
  'integrations',
  'pipeline_runs',
  'referral_accounts',
  'session_state',
  'system_health',
  'tkg_constraints',
  'tkg_directive_ml_global_priors',
  'tkg_directive_ml_snapshots',
  'user_brief_cycle_gates',
  'user_subscriptions',
  'waitlist',
] as const;

const EXPECTED_TABLES = [...DIRECT_USER_READ_TABLES, ...SERVICE_ONLY_TABLES].sort();

const isTenantRole = (roles: string[]) =>
  roles.includes('public') || roles.includes('authenticated');
const isPermissiveTenantPolicy = (p: Policy) =>
  p.permissive === 'PERMISSIVE' && isTenantRole(p.roles);

describe('RLS cross-tenant isolation contract (Pass 1, #445)', () => {
  it('snapshot covers exactly the expected table set (a new table must be classified, not silently added)', () => {
    const tables = snapshot.tables.map((t) => t.table).sort();
    expect(tables).toEqual(EXPECTED_TABLES);
  });

  it('every table has RLS enabled', () => {
    const without = snapshot.tables.filter((t) => !t.rls_enabled).map((t) => t.table);
    expect(without).toEqual([]);
  });

  it('LEAK GUARD: no PERMISSIVE public/authenticated policy grants rows without an auth.uid() predicate', () => {
    const leaks: string[] = [];
    for (const t of snapshot.tables) {
      for (const p of t.policies) {
        if (isPermissiveTenantPolicy(p) && !p.qual_has_auth_uid) {
          leaks.push(`${t.table}.${p.name} (roles=${p.roles.join(',')}, cmd=${p.cmd})`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('every directly-readable user table keeps a per-user auth.uid() policy', () => {
    for (const table of DIRECT_USER_READ_TABLES) {
      const t = snapshot.tables.find((x) => x.table === table);
      expect(t, `missing table ${table}`).toBeDefined();
      const hasUserPolicy = t!.policies.some(
        (p) => isPermissiveTenantPolicy(p) && p.qual_has_auth_uid,
      );
      expect(hasUserPolicy, `${table} lost its per-user auth.uid() policy`).toBe(true);
    }
  });

  it('every service-only table exposes NO direct public/authenticated read path', () => {
    for (const table of SERVICE_ONLY_TABLES) {
      const t = snapshot.tables.find((x) => x.table === table);
      expect(t, `missing table ${table}`).toBeDefined();
      const directPaths = t!.policies.filter(isPermissiveTenantPolicy).map((p) => p.name);
      expect(directPaths, `${table} unexpectedly allows direct tenant access`).toEqual([]);
    }
  });

  it('every RESTRICTIVE public policy is a hard deny (qual = false)', () => {
    const soft: string[] = [];
    for (const t of snapshot.tables) {
      for (const p of t.policies) {
        if (p.permissive === 'RESTRICTIVE' && isTenantRole(p.roles) && !p.qual_is_false) {
          soft.push(`${t.table}.${p.name}`);
        }
      }
    }
    expect(soft).toEqual([]);
  });
});
