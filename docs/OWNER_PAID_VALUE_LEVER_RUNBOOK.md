# Owner Paid Value-Lever Runbook

Purpose: the one test the firm-foundation audit (#445) **cannot** answer — does a
real, paid generation cycle on the owner's own data surface a **genuine gem** (a
move the owner would actually make), or does it still return "nothing cleared the
bar"? Green CI / audits are hygiene; this is the value test. Owner-only; involves
real (bounded) spend.

> This is **distinct** from `OWNER_CANARY_TEST_RUNBOOK.md` (that one validates
> connectors and explicitly forbids paid generation). This runbook deliberately
> runs paid generation, once, under hard cost caps.

## 1. Pre-flight — clear the dry-run gates (Vercel → Production env)

The manual run path `POST /api/settings/run-brief` goes paid only if
`resolveSettingsRunBriefPipelineDryRun` (`lib/config/prelaunch-spend.ts`) permits.
Check three env vars:

- `ANTHROPIC_API_KEY` — must be present (it already is in Production).
- `PROD_DEFAULT_PIPELINE_DRY_RUN` — if `true`, you must **also** set
  `ALLOW_PROD_PAID_LLM=true`. If unset/false, paid runs by default (legacy).
- `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN` — **irrelevant here**; it only gates the
  scheduled cron (`app/api/cron/daily-brief`), not the manual run-brief route.

Minimal change is usually: **set `ALLOW_PROD_PAID_LLM=true`, then redeploy.**

## 2. Ensure real signal exists

Sign in as the owner. Confirm connectors are live (`/api/integrations/status` shows
Gmail/Calendar connected) and a Morning Anchor / workday-presence state is saved
(some triggers only fire inside `if (state)`).

## 3. Fire exactly one run

Authenticated as owner: `POST /api/settings/run-brief?use_llm=true` (from the
dashboard run-brief control, or `curl` with the session cookie). Rate limit is 2 per
10 min per user.

## 4. Confirm it actually went paid

In the JSON response, `spend_policy.paid_llm_effective` **must be `true`**. If it is
`false`, a flag is still forcing dry-run — fix step 1 and retry. (`pipeline_dry_run:
true` means it skipped Anthropic and wrote a dry-run receipt.)

## 5. Cost safety (already enforced — exposure is bounded)

Hard caps in `lib/utils/api-tracker.ts`, applied to this path (`skipSpendCap:false`,
`skipManualCallLimit:false`):
- `DAILY_SPEND_CAP_USD = $1.00` / user / day (generation).
- `MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY = 3`.
- `EXTRACTION_DAILY_CAP = $0.25` / user / day (extraction/summarization).

Real-world generation is ~$0.02–0.19/user/day, so the worst case is cents-to-~$1.
**Kill switch:** set `ALLOW_PROD_PAID_LLM` back off (or
`PROD_DEFAULT_PIPELINE_DRY_RUN=true`) and redeploy → instantly re-quarantined.
Global emergency: `FOLDERA_EGRESS_EMERGENCY_MODE=true` blocks sync/dev routes.

## 6. The verdict (this is the test — not the HTTP 200)

- **Win:** a `tkg_actions` row persists with `status=pending_approval`, a real
  artifact, and an evidence/source trail — **and** the Right Now card's move is
  something the owner would genuinely act on. The scored winner should beat recency
  (magic invariant) and be grounded (`relatedEmails`/source trail non-empty).
- **Still failing:** `do_nothing` / "nothing cleared the bar," or a technically
  grounded move the owner would ignore. That is the real signal to chase next — a
  product-judgment call only the owner can make. Capture which one happened in #445.

## Why this is the owner's wall

Everything provable in the harness is green (audit #445 passes 0–12). The remaining
unknown is whether the brain produces value for a real person — which only a real
paid run + owner judgment can establish. Tied to the open **C-2** item (first-pass
validation quality, ~74% retry → ~2× cost) which a paid run also measures.
