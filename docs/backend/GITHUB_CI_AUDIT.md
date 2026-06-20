# GitHub CI & Workflows — Master Audit #445, Pass 10

> Status: written 2026-06-20. Forensic pass over `.github/workflows/*` — triggers,
> change-awareness, draft handling, the required-check aggregator, scheduled-cron
> exposure, and the agent workflows. No paid calls. Verdict: **`PASS`** (CI posture
> healthy; one cross-cutting ground-truth correction recorded + memory fixed).

---

## TL;DR

CI is well-architected. `ci.yml` runs on **`pull_request` + `workflow_dispatch`**
(Pass 0 finding F-1, now live), is **change-aware** (`dorny/paths-filter` derives
which lanes run — docs/test PRs get lint+unit only, Playwright only when its routes
change), **skips draft PRs**, cancels superseded runs via concurrency, and uses a
**build-once-reuse-everywhere** artifact model with a `ci-passed` aggregator job as
the single required check. Crucially, **no workflow carries a `schedule:` trigger**
— every cron-ish / agent / heartbeat workflow is `workflow_dispatch`-only, which is
exactly right for a billing-capped private repo (a `schedule:` would instant-fail
and burn the Actions budget). Deploy + health-gate fire on `push: main`.

---

## Inventory (18 workflows)

| Workflow | Trigger | Notes |
|---|---|---|
| `ci.yml` | `pull_request`, `workflow_dispatch` | Change-aware; draft-skip; `ci-passed` aggregator. **F-1 live.** |
| `deploy.yml` | `push: main` | Production deploy. |
| `health-gate.yml` | `push: main`, `workflow_dispatch` | Post-deploy health. |
| `docs-fast.yml` | `workflow_dispatch` | Docs lane. |
| `pr-sentinel.yml` | `workflow_dispatch` | Continuity-gate / PR-receipt / contract-diff runner. |
| `production-e2e.yml` | `workflow_dispatch` | Auth/live-brief smoke kept manual. |
| `issue-auto-label.yml` | issues event | Labeling. |
| `pipeline-cron-heartbeat`, `workday-presence-trigger-runner`, `signal-drain`, `loop-health-guardian`, `weekly-audit` | `workflow_dispatch` | Cron-ish levers — **manual only** (no `schedule:`). |
| `agent-{ui-critic, self-optimizer, distribution-finder, gtm-strategist, health-watchdog, retention-analyst}.yml` | `workflow_dispatch` | Manual levers into the agent-runner (see F-10.1). |

---

## Kill-question scorecard (Senior Software Engineer / CI hygiene)

| Concern | Verdict | Evidence |
|---|---|---|
| Does CI actually run on PRs (not dispatch-only)? | **PASS** | `ci.yml` `on: pull_request` (F-1). |
| Any `schedule:` cron that would instant-fail / burn budget on this billing-capped repo? | **PASS** | Zero `schedule:` triggers across all 18 workflows (greps clean; the two that had one carry comments documenting its removal). |
| Is CI change-aware (no full Playwright on a docs PR)? | **PASS** | `dorny/paths-filter@v4` gates smoke/authenticated/payments/build lanes; docs-only short-circuits to lint+unit. |
| Single source of truth for "green"? | **PASS** | `ci-passed` aggregator (`always()`) collapses skipped-as-ok so drafts/docs stay green; intended as the branch-protection required check. |

---

## F-10.1 (cross-cutting ground-truth correction) — growth agents are *quarantined*, not *deleted*

Six `agent-*.yml` workflows POST to `/api/cron/agent-runner?agent=…`, which is a
**live** endpoint backed by `lib/agents/run-agent.ts` and real implementations
(`gtm-strategist.ts`, `distribution-finder.ts`, `retention-analyst.ts`,
`self-optimizer.ts`, `health-watchdog.ts`). This initially looked like orphaned dead
config — it is **not**. The accurate picture:

- The growth/acquisition agents are gated behind a **default-OFF kill switch**
  (`areAgentsEnabled`, `lib/agents/agents-enabled.ts`): a missing
  `tkg_goals(source=system_config, goal_text=agents_enabled)` row ⇒ DISABLED, so
  `runScheduledAgent` returns `{skipped: true, reason: 'agents_disabled'}` without
  running. Default-off is deliberate (issue #231). Only zero-LLM `health_watchdog`
  is exempt. A `hasAgentBudget` cost-guard sits in front too.
- The workflows are **`workflow_dispatch`-only** — no `schedule:`, so they never
  auto-run and cost nothing at rest.

**Net:** the runtime posture matches the "acquisition quarantined OFF" safety rail
— but the *code was retained behind a switch, not removed*. The earlier memory note
`project_growth_layer_deleted` ("doesn't exist in the repo anymore") was inaccurate
and has been **corrected** as part of this pass (the audit's anti-rediscovery
mandate). No code change: the workflows are safe as-is. Whether to keep these manual
levers or prune them is an owner call, not a unilateral delete.

---

## Owner item (not code-fixable)

- **Branch protection on `main` is still OFF.** The `ci-passed` check exists and is
  designed to be required; enabling "require `ci-passed`" on `main` is a
  GitHub-settings action only the owner can perform.

---

## Proof

- All 18 workflow trigger blocks read; `schedule:`/`cron:` grep across
  `.github/workflows/` returns zero non-comment hits.
- `agent-runner` route + `lib/agents/*` + `areAgentsEnabled` read to establish the
  quarantine-not-deletion ground truth.
- No code change in this pass; memory note corrected out-of-band.
