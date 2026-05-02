# Migration Reconciliation Report — 2026-05-02

## Scope

Read-only schema reconciliation pass for seam 5 of the full audit closure plan.

No DB mutation was attempted.

## Commands Run

```bash
npx supabase migration list --linked
npx supabase db lint --linked
```

## Current State

- Local migration files in `supabase/migrations`: `76`
- Matched local/remote versions: `2`
  - `20260412161045`
  - `20260427000000`
- Local-only migration files: `74`
- Remote-only migration versions: `55`
- Duplicate local timestamp version: `20260314000002`
  - `20260314000002_growth_goal.sql`
  - `20260314000002_signal_summaries.sql`

## Five Most Recent Local Migrations

1. `20260427000000_restrict_internal_security_definer_rpcs.sql` — restrict internal security-definer RPCs
2. `20260412161045_tkg_signals_user_occurred_at_index.sql` — add `tkg_signals(user_id, occurred_at)` index
3. `20260410110000_fkey_indexes_ml_snapshots_and_goals.sql` — add foreign-key/index support for ML snapshots and goals
4. `20260410100000_security_invoker_api_budget_status_and_rls_internal.sql` — security invoker / api-budget / internal RLS updates
5. `20260409210000_rls_initplan_and_dedupe_policies.sql` — RLS initplan and dedupe policy changes

## Local-Only Migration Files

```text
20250111000000_create_waitlist_table.sql
20250112_waitlist.sql
20250112000000_meeting_prep_system.sql
20250121000000_create_integrations_table.sql
20250122000000_create_pending_actions_table.sql
20250123000000_create_risk_alerts_table.sql
20250124000000_create_context_engine.sql
20250124000001_fix_context_engine_fk.sql
20250130000000_billing_system.sql
20250201000000_security_and_performance.sql
20250202000000_shadow_mode.sql
20250903211527_fortify_violations_table.sql
20251115000100_email_drafts.sql
20251115000200_email_drafts_add_metadata.sql
20251123_allow_azure_ad.sql
20251125000000_add_outlook_source.sql
20251221000000_temporal_knowledge_graph.sql
20260308000001_extend_tkg_briefings.sql
20260308000002_rls_tkg_tables.sql
20260309000001_waitlist_simplify_rls.sql
20260309000002_tkg_entity_unique_and_source.sql
20260309000003_tkg_goals.sql
20260309000004_tkg_actions.sql
20260309000005_tkg_actions_feedback.sql
20260311000001_user_subscriptions.sql
20260311100000_fix_integrations_providers.sql
20260312000001_retry_columns.sql
20260312000002_subscription_deletion.sql
20260312000003_brain_upgrade.sql
20260313000001_goals_outcomes_upgrade.sql
20260313000002_api_usage.sql
20260314000000_bayesian_patterns.sql
20260314000001_waitlist_invite_tracking.sql
20260314000002_growth_goal.sql
20260314000002_signal_summaries.sql
20260315000001_user_tokens.sql
20260316000001_reset_outlook_signals.sql
20260316000002_add_artifact_to_tkg_actions.sql
20260319000001_commitment_suppression.sql
20260319000002_signal_summaries_week_end.sql
20260322000001_add_conversation_sources.sql
20260323000001_suppress_stale_commitments.sql
20260323000002_add_user_id_to_subscriptions.sql
20260323000003_auth_user_lookup_rpc.sql
20260323000004_expand_goals_source_check.sql
20260324000001_api_usage_endpoint.sql
20260324000002_restore_user_feedback_signal_source.sql
20260325000001_health_alert.sql
20260325000002_soft_disconnect.sql
20260325000003_atomic_goal_replacements.sql
20260326000001_unify_check_constraints.sql
20260326000002_api_usage_index.sql
20260326000003_remove_test_subscription.sql
20260327000001_add_outcome_closed.sql
20260327000002_cleanup_malformed_suppressions.sql
20260328000001_security_and_perf_fixes.sql
20260330000001_add_trust_classification.sql
20260330000002_recount_real_interactions.sql
20260331120000_agent_layer.sql
20260401000001_add_service_role_policies.sql
20260401000002_fix_tkg_actions_action_type_check.sql
20260401120000_widen_signal_pool_constraints.sql
20260404000001_apply_commitment_ceiling.sql
20260404000002_create_system_health.sql
20260405000001_directive_ml_moat.sql
20260407000001_user_brief_cycle_gates.sql
20260407120000_pipeline_runs.sql
20260407160000_tkg_signals_user_content_hash_unique_full.sql
20260408180000_oauth_reauth_dashboard_visit.sql
20260409180000_tkg_signals_extraction_parse_error.sql
20260409200000_api_budget_functions_search_path.sql
20260409210000_rls_initplan_and_dedupe_policies.sql
20260410100000_security_invoker_api_budget_status_and_rls_internal.sql
20260410110000_fkey_indexes_ml_snapshots_and_goals.sql
```

## Remote-Only Migration Versions

```text
20260313161447
20260313162227
20260313162239
20260313162257
20260313193417
20260316170901
20260318035354
20260318035539
20260318035650
20260318035729
20260318035904
20260318040033
20260318040049
20260318180024
20260318180048
20260320151436
20260320151517
20260323173352
20260323173435
20260323203046
20260324153725
20260324153739
20260324194855
20260325003734
20260325024459
20260325030106
20260325030600
20260325040914
20260325041107
20260327181945
20260327181950
20260327181958
20260327182007
20260327220345
20260330031817
20260401034605
20260401034616
20260401070638
20260401074945
20260403144654
20260404003108
20260405150421
20260407002838
20260407150934
20260407160051
20260407220821
20260408030300
20260408031530
20260408140704
20260409174311
20260409194528
20260409194945
20260409200135
20260409200715
20260430151722
```

## `db lint --linked` Blocker

`npx supabase db lint --linked` did not complete. The linked remote requires a valid `SUPABASE_DB_PASSWORD`, and the current shell does not have working credentials.

Observed error excerpt:

```text
failed SASL auth (FATAL: password authentication failed for user "cli_login_postgres")
FATAL: Circuit breaker open: Too many authentication errors
Connect to your database by setting the env var correctly: SUPABASE_DB_PASSWORD
```

## Interpretation

- The repo and linked remote are not in a normal linear migration state.
- Only two versions match between local and remote history, so automatic “apply missing locals” would be unsafe.
- The remote contains a large set of versions that are not represented in local source control.
- The local repo contains a large set of migration files that are not represented in the linked remote history.
- `20260314000002` is duplicated locally across two filenames, which is an additional reconciliation hazard even before any apply step.
- Because `db lint --linked` could not authenticate, the live schema contract is not yet validated.

## Next Required Move

1. Provide a valid `SUPABASE_DB_PASSWORD` for the linked project.
2. Re-run:
   - `npx supabase migration list --linked`
   - `npx supabase db lint --linked`
3. Choose an explicit reconciliation strategy for the remote-only and local-only history.
4. Only after that strategy is approved should any DB mutation be attempted.
