# Source Of Truth Map

Last updated: 2026-06-10 PT (issue #240 — Governance Collapse v1)

This is the keep-list ledger. Everything not listed here is reference, archive, or git history — never authority.

## Keep-list

| File | Role |
| --- | --- |
| `ACTIVE_HANDOFF.md` | Current command state and next exact move. The first thing every session reads. |
| `ACTIVE_SEAM_STATE.json` | Machine-readable active seam state: active issue, branch, PR, deployed SHA, runtime env, and DB-state expectation. |
| Active GitHub issue | The one implementation seam. Named by `ACTIVE_HANDOFF.md`. |
| `FOLDERA_BUILD_ORDER.yaml` | Machine-readable active issue, launch ladder, closeout requirements. |
| `.foldera-contract.json` | Machine-readable allowed/forbidden file boundary for the active seam. |
| `FOLDERA_MASTER_BIBLE.md` | Product doctrine, north star, and product operating system (reference authority, merged by #240). |
| `AGENTS.md` | The single agent execution contract. `CLAUDE.md`, `.cursorrules`, `.cursor/rules/agent.mdc` are pointers to it. |
| `README.md` | Repo entrypoint and local commands. |
| `SESSION_HISTORY.md` / `LESSONS_LEARNED.md` | Append-only history. Never current control. |
| `docs/SOURCE_OF_TRUTH_MAP.md` | This ledger. |

## Conflict rule

`ACTIVE_HANDOFF.md` plus the active GitHub issue beat everything else. Gate/CI/runtime proof beats prose. Archived and deleted files cannot control work; git history is the archive.

## Anti-regrowth rule

A new governance rule may only be added by editing an existing keep-list file, never by creating a new file. `npm run gate:continuity` enforces this mechanically by capping the root markdown file count.

## Enforcement

`npm run gate:continuity` (also run by PR Sentinel in CI) checks: keep-list files exist, root markdown count is bounded, `ACTIVE_HANDOFF.md` names exactly one seam and stays <= 80 lines, `ACTIVE_SEAM_STATE.json` agrees with handoff/build-order/contract/current branch, and the PR template keeps the source-truth closeout section.

## Supabase Runtime Table Map

| Table | Status | Role in Current Workday Presence / trigger-runner / Slack Flow |
| --- | --- | --- |
| `auth.users` | **Authoritative** | Stores `user_metadata` fields: `workday_presence_state` (the active presence card/state) and `workday_presence_suppression_trace` (the last safe-silence/failure trace). |
| `tkg_signals` | **Authoritative** | The input event stream. Evaluated by trigger-runner to determine if a context change triggers a new Right Now intervention. |
| `tkg_actions` | **Authoritative (current-path rows only)** | Durable receipts log. Current-path rows have `action_source IN ('workday_presence_trigger', 'workday_presence')`. Legacy rows (`action_source=agent_*` or `NULL`) are not current product truth and must not be counted as finished moves. Loop health guardian checks `approved_at` on current-path rows. |
| `user_tokens` | **Authoritative** | Stores Google/Microsoft integration OAuth sync status, tokens, and reauth status. |
| `integrations` | **Authoritative** | Stores active user integration settings for Gmail/Calendar/Microsoft. |
| `pipeline_runs` | **Authoritative** | Observability run-log for trigger runs (`phase='user_run'`) and cron pipelines. |
| `tkg_commitments` | **Authoritative** | Used during `seed-from-scorer` generation to fetch/evaluate user obligations. |
| `tkg_entities` | **Authoritative** | Used during `seed-from-scorer` generation to filter and check entity trust. |
| `api_usage` / `api_budget` | **Authoritative** | Budgets and costs tracking for model calls. |
| `tkg_briefings` | **Legacy (Deprecated)** | Legacy chief-of-staff caching. Not used; endpoint `/api/briefing/latest` returns 501. |
| `user_brief_cycle_gates` | **Legacy (Deprecated)** | Legacy daily brief 20-hour cycle cooldown. Ignored by trigger runner. |
| `signal_summaries` | **Legacy (Deprecated)** | Legacy daily briefing summarizations. Ignored by trigger runner. |
| `waitlist` / `referral_accounts` | **Legacy (Deprecated)** | Legacy waitlist and referral data. |

