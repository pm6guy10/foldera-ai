# Backend / Runtime Correctness — Master Audit #445, Pass 4

> Status: written 2026-06-19. Read-only forensic pass over the cron orchestration,
> the paid-LLM gate, retries, the canary/egress switches, and failure modes —
> cross-checked against the live `api_usage` table (no paid calls). This is the
> canonical "how the runtime actually behaves" record so it is captured once and
> never re-derived. Verdict: **`CONCERN`** (one bug fixed in-pass; two cost
> concerns routed/deferred with reasons).

---

## TL;DR

The runtime is fundamentally sound: the paid path is **fail-closed and gated three
ways before any spend**, writes are idempotent so a mid-pipeline failure cannot
corrupt state, and the canary + egress switch are actually wired. Two real concerns
remain, both about money not safety: generation pays **~2× per delivered draft**
because ~74% of first directive attempts fail validation and trigger a full second
paid call (**C-2**, carried from Pass 3), and the monthly budget is reserved as a
flat unreconciled estimate. One concrete orchestration bug — a thrown early stage
could silently drop the rest of the day's pipeline — was **fixed in this pass**.

---

## 1. Cron orchestration

Single Vercel cron (`vercel.json`): `/api/cron/morning-pipeline` at `0 11 * * *`
(11:00 UTC / 4am PT). It is a **sequential orchestrator** (`app/api/cron/morning-pipeline/route.ts`)
that runs three child routes in order, forwarding the `CRON_SECRET` auth:

1. `nightly_ops` — sync (Microsoft/Google) → token refresh → signal processing →
   behavioral graph → entity trust repair → passive rejection (10 substages, each
   with its own try/catch; `app/api/cron/nightly-ops/`).
2. `daily_brief` — the **value/delivery stage**: credit-canary gate → double-fire
   guard → `runBriefLifecycle()` (generate + send).
3. `daily_maintenance` — retention, engagement signals, calibration, self-heal,
   acceptance gate, ML priors (Sunday adds goal refresh/infer/abandon).

Overall `ok` is `every(stage.ok)`; the route returns **200** when all pass, **207**
(multi-status / degraded) when any stage reports `ok:false`. The 13 other cron
*routes* under `app/api/cron/**` are not Vercel-scheduled — they are
external/event-driven/manual (Pass 0 finding F-3).

---

## 2. The paid-LLM path is gated three ways, all before spend

Every paid Anthropic call in the generation path passes three independent gates:

| Gate | Where | What it enforces | Failure mode |
|---|---|---|---|
| **Paid-LLM gate** | `lib/llm/paid-llm-gate.ts` `assertPaidLlmAllowed()` — called at `generatePayload` (`generator.ts:9940`) | Fail-closed env policy: non-prod needs `ALLOW_PAID_LLM=true`; prod-dry-run needs `ALLOW_PROD_PAID_LLM=true`; legacy prod = live | **throws** `PaidLlmDisabledError` |
| **Daily spend cap** | `lib/utils/api-tracker.ts` `isOverDailyLimit()` — called at `generateDirective` entry (`generator.ts:10352`) | Reads **actual** `api_usage` spend for the UTC day; `$1.00` generation / `$0.25` extraction (`EXTRACTION_DAILY_CAP`, reverted 4→0.25 in Pass 3 C-1) | returns empty directive, **no paid call** |
| **Monthly budget governor** | `lib/llm/anthropic-budget-governor.ts` `ensureAnthropicBudget()` → `lib/cron/api-budget.ts` Postgres RPC `api_budget_check_and_reserve` — called before the candidate loop (`generator.ts:10606`) | Postgres-enforced monthly cap; fail-closed (RPC error / `allowed!==true` → blocked) | **throws** `AnthropicBudgetExceededError` → budget-cap directive |

There is **no path** by which a paid directive call escapes all three. The daily
cap reads real spend (exact, not an estimate); the monthly cap lives in Postgres
(TS only calls the RPC). This is a genuinely solid spend wall — the live numbers
(Pass 3: `$0.02–0.19/user/day` vs `$0.97` revenue) confirm it holds.

**Caveat (B-4 below):** the gates are checked **once per `generateDirective`**, not
per call. A single run can fire several paid calls (anomaly + directive + retries ×
candidates) under one daily-cap read and one flat budget reservation.

---

## 3. The retry tax — C-2 root-caused

Generation retries live in `lib/briefing/generator.ts` (the directive loop,
~9998–10249) with two nested budgets:

- **Validation retry:** `MAX_DIRECTIVE_VALIDATION_RETRIES = 1` → up to 2 attempts.
  The common path: the first call parses fine but **fails `validateGeneratedArtifact`**,
  so a second full paid Sonnet call is made with a repair prompt.
- **JSON-parse retry:** `MAX_JSON_PARSE_RETRIES = 2` extra calls per attempt when the
  model returns unparseable text (rare).

Every call after the very first (`attempt 0, parseRetry 0`) is billed as
`directive_retry` (`generator.ts:10023`). Common case = exactly one retry; worst
case = `2 × (1 + 2) = 6` LLM calls.

**Live cross-check (`api_usage`, lifetime to 2026-06-19):**

| endpoint | events | USD | avg out tok |
|---|---:|---:|---:|
| `directive` | 637 | 9.98 | 534 |
| `directive_retry` | 471 | 6.68 | 728 |

→ **~74% of directives incur a retry** (471/637); retries cost more per call
(larger context). Generation pays **~2× per delivered draft**, and ~40% of total
generation spend is retries.

**Root cause:** first-pass `validateGeneratedArtifact` failures. The repair prompt
(`generator.ts:10212–10228`) reveals the likely drivers — bracket placeholders
(`[Name]`, `[Date]`) and wrong `artifact_type`/`decision`. These are
generation-quality (prompt/model) issues, **not** a runtime bug.

**Disposition:** routed to **Pass 5 (AI/ML grounding)** + a paid validation cycle.
Reducing the first-pass failure rate is the highest-ROI cost lever, but changing
generation behavior without paid validation is exactly the mistake #445 already made
once (#452 gem-surfacing revert) — **not shipped blind here.** The docstring at
`generator.ts:9455` was corrected this pass (it understated the worst case).

---

## 4. Findings ledger

| # | Severity | Finding | Disposition |
|---|---|---|---|
| **B-1** | PASS | Paid path fail-closed + triple-gated (env / daily real-spend cap / monthly Postgres budget) before any spend | guarded by `lib/llm/__tests__/paid-llm-gate.test.ts` + `lib/llm/__tests__/anthropic-budget-governor.test.ts` + `tests/cost/__tests__/extraction-cap.test.ts` |
| **B-2** | CONCERN → **FIXED** | `morning-pipeline` orchestrator had no per-stage isolation: an uncaught throw in `nightly_ops` propagated out of the loop and dropped `daily_brief` (value stage) + `daily_maintenance` for the whole day | `invokeStage` now wraps each handler in try/catch → throw becomes a recorded `status:500, ok:false, threw:true` result and the loop continues (207). Fails safe (more stages run, never fewer). Locked by the new isolation invariant in `app/api/cron/morning-pipeline/__tests__/route.test.ts`. |
| **B-3 (=C-2)** | CONCERN | `directive_retry` is a full second paid call; ~74% retry rate (471/637 live) from first-pass validation failures; ~2× cost per draft | bounded at 1 validation retry (good); root cause = generation quality → **Pass 5 + paid validation**. Docstring corrected. |
| **B-4** | CONCERN | Monthly budget reserves a **flat 10¢ estimate** (`ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS`) once per `generateDirective`, never reconciled to actual `api_usage` spend; a run can fire multiple paid calls | conservative in the common case (~3¢ actual < 10¢ reserved → trips early = safe); can under-reserve on retry/multi-candidate runs. **Deferred:** needs budget-RPC reconciliation design; not bleeding (Pass 3). |
| **B-5** | NOTE | Retry-reason `issue_buckets` (the data that would root-cause C-2) are emitted only to console/Vercel logs via `logStructuredEvent` — never persisted to a queryable table | routes to **Pass 11 (observability)**: persist generation retry reasons so the top cost driver is diagnosable from the DB |
| **B-6** | PASS (note) | Failure model is deliberately fail-open/fail-soft: per-substage try/catch, idempotent writes (`UNIQUE(user_id, content_hash)`, Pass 2 D-2), daily-brief double-fire guard. A mid-pipeline failure yields recoverable soft-inconsistency windows (e.g. a `pending_approval` directive whose send defers to the next cycle), **not hard corruption**. No transactions/rollback, by design. | recorded; no action |

**Canary & egress (both wired, confirmed):**
- **Credit canary** `checkApiCreditCanary()` (`lib/cron/acceptance-gate.ts`) runs in
  the `daily_brief` hot path; if `ANTHROPIC_API_KEY` is missing it skips the brief
  (non-fatal `ok:false`). **PASS.**
- **Egress emergency switch** `FOLDERA_EGRESS_EMERGENCY_MODE` (`lib/utils/egress-emergency.ts`)
  blocks manual sync + dev routes for non-operators (HTTP 423). **PASS (note:**
  manual operator flag — there is no automatic circuit-breaker that trips it).

---

## 5. Verdict — `CONCERN`

Runtime correctness is **sound on safety**: the paid wall is fail-closed and
triple-gated before spend, writes are idempotent so failures don't corrupt state,
and the canary/egress switches are real. The verdict is `CONCERN` not `PASS` because
two **cost** issues are real and unresolved here: the ~74% retry tax (C-2/B-3, ~40%
of generation spend, root cause needs paid Pass 5 validation) and the flat
unreconciled budget reservation (B-4). One concrete orchestration bug (B-2) was
fixed in-pass and locked with a test.

**Next:** Pass 5 (AI/ML) owns the C-2 first-pass-validation-quality fix with paid
validation; Pass 11 (observability) owns B-5 (persist retry reasons); B-4 is a
deferred budget-reconciliation follow-up. Pass 4 box checked.
