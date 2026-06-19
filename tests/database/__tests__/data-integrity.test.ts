import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pass 2 (Master Audit #445) — database & data-integrity contract.
 *
 * Asserts the integrity invariants over a committed snapshot of the live schema
 * (tests/database/data-integrity-snapshot.json, generated read-only from production).
 * CI has no DB and the JS client can't read pg_catalog, so the snapshot is the
 * contract; the live read-only proof is recorded in docs/database/DATA_INTEGRITY.md.
 *
 * These invariants fail loudly if a migration adds an un-indexed user table, drops a
 * dedupe constraint, or adds a table without classifying its tenancy.
 */

interface UserScoped { table: string; has_user_id: boolean; user_id_leading_index: string | null }
interface NonUserScoped { table: string; reason: string }
interface IndexGap { table: string; note: string }
interface UniqueConstraint { table: string; columns: string[]; role?: string }
interface Snapshot {
  user_scoped_tables: UserScoped[];
  non_user_scoped_tables: NonUserScoped[];
  known_index_gaps: IndexGap[];
  idempotency_unique_constraints: UniqueConstraint[];
  receipt_table: { table: string; reconstruct_trail_columns: string[] };
}

const here = dirname(fileURLToPath(import.meta.url));
const snap = JSON.parse(
  readFileSync(join(here, '..', 'data-integrity-snapshot.json'), 'utf8'),
) as Snapshot;

// Full table set must equal Pass 0's inventory (26) — forces tenancy classification of any new table.
const EXPECTED_TABLES = [
  'api_budget', 'api_usage', 'cost_events', 'integrations', 'pipeline_runs',
  'referral_accounts', 'session_state', 'signal_summaries', 'system_health',
  'tkg_actions', 'tkg_briefings', 'tkg_commitments', 'tkg_conflicts', 'tkg_constraints',
  'tkg_directive_ml_global_priors', 'tkg_directive_ml_snapshots', 'tkg_entities',
  'tkg_feedback', 'tkg_goals', 'tkg_pattern_metrics', 'tkg_signals', 'tkg_user_meta',
  'user_brief_cycle_gates', 'user_subscriptions', 'user_tokens', 'waitlist',
].sort();

const gapTables = new Set(snap.known_index_gaps.map((g) => g.table));

describe('Database data-integrity contract (Pass 2, #445)', () => {
  it('classifies exactly the expected 26 tables (new table must be classified user-scoped or not)', () => {
    const all = [
      ...snap.user_scoped_tables.map((t) => t.table),
      ...snap.non_user_scoped_tables.map((t) => t.table),
    ].sort();
    expect(all).toEqual(EXPECTED_TABLES);
  });

  it('every user-scoped table has a user_id column', () => {
    const missing = snap.user_scoped_tables.filter((t) => !t.has_user_id).map((t) => t.table);
    expect(missing).toEqual([]);
  });

  it('every user-scoped table has a user_id-leading index, except documented known gaps', () => {
    for (const t of snap.user_scoped_tables) {
      if (gapTables.has(t.table)) {
        expect(t.user_id_leading_index, `${t.table} is a known gap → must be null until fixed`).toBeNull();
      } else {
        expect(t.user_id_leading_index, `${t.table} is missing a user_id-leading index`).toBeTruthy();
      }
    }
  });

  it('the only known index gap is cost_events (so a new unindexed user table fails this test)', () => {
    expect([...gapTables].sort()).toEqual(['cost_events']);
  });

  it('reprocessing dedupe exists: tkg_signals is unique on (user_id, content_hash)', () => {
    const sig = snap.idempotency_unique_constraints.find((c) => c.table === 'tkg_signals');
    expect(sig, 'tkg_signals dedupe constraint missing').toBeDefined();
    expect(sig!.columns).toEqual(['user_id', 'content_hash']);
  });

  it('the receipt table can reconstruct before→verdict→after→source', () => {
    const required = ['evidence', 'reason', 'status', 'generated_at', 'approved_at', 'executed_at', 'execution_result', 'action_source'];
    for (const col of required) {
      expect(snap.receipt_table.reconstruct_trail_columns, `tkg_actions missing receipt column ${col}`).toContain(col);
    }
  });
});
