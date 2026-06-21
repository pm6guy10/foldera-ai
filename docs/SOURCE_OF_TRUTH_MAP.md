# Source Of Truth Map

Last updated: 2026-06-21 UTC (control plane repointed back to the Scout seam #494 after the owner-directed LANDING design pass #496 merged to main, PR #497 squash 5c2f43d, and #496 closed. The landing detour was a temporary owner-authorized seam; #494 resumes as the one active seam — its money-move is owner-gated runtime activation, BLOCKED_WITH_EXACT_RECEIPT. Prior: 2026-06-20 issue #494 — SCOUT §3 promoted from compass #492, supersedes the build umbrella #486.)

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
| `docs/DESIGN_SYSTEM.md` | Binding design standard / quality bar for every visible surface (tokens, type, spacing, real-logos rule, product mockup, motion, responsive). Design authority, referenced by `FOLDERA_MASTER_BIBLE.md`. |
| `docs/SYSTEM_INVENTORY.md` | Canonical "what IS" — every table, route, cron, env var, external resource, reconciled against real Supabase/GitHub/Vercel state (Pass 0 of Master Audit #445). The anti-rediscovery foundation; update it when the real system changes, never re-derive it. |

## Master Audit #445 — canonical pass records (anti-rediscovery ledger)

Each pass of the firm-foundation audit produced a canonical record. **Read the
relevant record before re-investigating its domain — these are the answer, not a
starting point.** Update a record when its domain genuinely changes; never re-derive
it from scratch.

| Pass | Domain | Verdict | Canonical record |
| --- | --- | --- | --- |
| 0 | Inventory / ground-truth | — | `docs/SYSTEM_INVENTORY.md` |
| 1 | Security / RLS | `PASS` | issue #445 (#447) |
| 2 | DB integrity | `PASS` | issue #445 (#449/#450) |
| 3 | Cost / economics | `CONCERN` | `docs/COST_AND_ECONOMICS_AUDIT.md` |
| 4 | Backend / runtime correctness | `CONCERN` | `docs/backend/RUNTIME_CORRECTNESS.md` |
| 5 | AI/ML grounding & faithfulness | `PASS` | `docs/backend/AI_GROUNDING_FAITHFULNESS.md` |
| 6 | Frontend perf / a11y | `PASS` | `docs/frontend/PERF_A11Y_AUDIT.md` |
| 7 | Frontend design / UX | `PASS` | `docs/frontend/DESIGN_UX_AUDIT.md` |
| 8 | Trust / honest-claims | `PASS` | `docs/frontend/TRUST_HONEST_CLAIMS_AUDIT.md` |
| 9 | Vercel deploy / config | `PASS` | `docs/backend/VERCEL_DEPLOY_AUDIT.md` |
| 10 | GitHub CI / workflows | `PASS` | `docs/backend/GITHUB_CI_AUDIT.md` |
| 11 | Observability / logging | `PASS` | `docs/backend/OBSERVABILITY_AUDIT.md` |
| 12 | Governance / memory meta-fix | `PASS` | this section + the meta-fix below |

Open carry-forwards (owner wall, not re-litigation): **C-2** first-pass directive
validation quality (~74% retry → ~2× cost; needs a paid generation cycle to verify a
fix — see RUNTIME_CORRECTNESS + AI_GROUNDING_FAITHFULNESS) and the **value lever**
(one paid generation cycle to confirm a real gem surfaces). The exact owner steps
for the value-lever run are in `docs/OWNER_PAID_VALUE_LEVER_RUNBOOK.md`.

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
| `scout_drive_chunks` | **Provisioned (Scout lane #486; inert until SCOUT_RAG_ENABLED)** | Chunked + embedded Google Drive content (`vector(1024)`, Voyage voyage-3.5; `content` encrypted at rest) for the proactive Scout's retrieval. Read via the `match_scout_chunks` RPC. Migration `20260620120000` committed Stage 0; **not yet applied** to production. |
| `scout_drive_index_state` | **Provisioned (Scout lane #486; inert until SCOUT_RAG_ENABLED)** | Resumable full-Drive crawl cursor, one row per user. Migration `20260620120000`; not yet applied. |
| `tkg_briefings` | **Legacy (Deprecated)** | Legacy chief-of-staff caching. Not used; endpoint `/api/briefing/latest` returns 501. |
| `user_brief_cycle_gates` | **Legacy (Deprecated)** | Legacy daily brief 20-hour cycle cooldown. Ignored by trigger runner. |
| `signal_summaries` | **Legacy (Deprecated)** | Legacy daily briefing summarizations. Ignored by trigger runner. |
| `waitlist` / `referral_accounts` | **Legacy (Deprecated)** | Legacy waitlist and referral data. |

