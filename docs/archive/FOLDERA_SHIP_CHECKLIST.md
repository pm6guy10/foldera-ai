# FOLDERA SHIPPING CHECKLIST

Updated: March 24, 2026
Status key: **PROVEN** (receipt exists) | **BUILT** (pushed, not verified) | **NOT STARTED**

## IMMUNE SYSTEM (lib/cron/self-heal.ts)

| Defense | Status | Evidence |
|---|---|---|
| Token watchdog | BUILT | `8b3e0fc` defense1TokenWatchdog in self-heal.ts. First live run at 11:00 UTC. |
| Commitment ceiling (150) | BUILT | `8b3e0fc` defense2CommitmentCeiling. Auto-suppress oldest beyond 150/user. |
| Signal backlog drain + dead_key | BUILT | `8b3e0fc` defense3SignalBacklogDrain. Processes up to 100, flags undecryptable. |
| Queue hygiene (auto-skip 24h) | BUILT | `8b3e0fc` defense4QueueHygiene. Auto-skip stale, abandon 7d executed. |
| Delivery guarantee (wait_rationale) | PROVEN | Resend `9f8ed15d` — slim wait_rationale email delivered to Brandon. |
| Health alert email | BUILT | `8b3e0fc` defense6HealthAlert. Sends to brief@foldera.ai on failure. |

## GATES

| Gate | Status | Evidence |
|---|---|---|
| Gate 1: Email delivery | PROVEN | Resend `ef5f37b3` (test directive), `2c573433` (wait_rationale), `9f8ed15d` (slim). Inbox confirmed. |
| Gate 2: Second user | PROVEN | Test user `22222222` got own directive row `8537c9f5`, separate from Brandon's `e5ed3b8c`. |
| Gate 3: Stripe e2e | NOT STARTED | Never tested against Stripe test mode. |
| Gate 4: Commitment explosion sim | BUILT | Dedup gate in conversation-extractor (`db37a31`). Purge done (98 active). Not simulated for new user. |
| Gate 5: Onboarding walkthrough | NOT STARTED | Never tested as stranger. |
| Gate 6: acceptance-gate.ts | NOT STARTED | Script not built. |

## EMAIL QUALITY

| Item | Status | Evidence |
|---|---|---|
| Wait_rationale slim (one line) | PROVEN | `9033644` deployed. Resend `9f8ed15d`. One line: "Foldera checked N candidates..." |
| "Why Waiting Wins" killed | PROVEN | Removed in `9033644`. Grep confirms single-line template. |
| Goals seeded (ESD, MA4, MAS3 onboard) | PROVEN | 3 rows: `7ae7e76c`, `9ce4e733`, `687bdf34`. |
| Scorer threshold gap | OPEN | Top candidate 1.05 vs threshold 2.0. Keri Nopens suppressed. New goals may unlock. |

## REPO DOCS

| Item | Status | Evidence |
|---|---|---|
| LESSONS_LEARNED.md in repo root | PROVEN | `d863e28`. 8 permanent rules. |
| CLAUDE.md references LESSONS_LEARNED | PROVEN | `d863e28`. Pre-flight step 3. |
| AGENTS.md references LESSONS_LEARNED | PROVEN | `d863e28`. Required reading section. |
| FOLDERA_SHIP_CHECKLIST.md | PROVEN | This file. Updated every session close. |
| NIGHTLY_REPORT.md | BUILT | `536bb64`. Updated by orchestrator sessions. |
| AUTOMATION_BACKLOG.md | BUILT | `536bb64`. Updated by orchestrator sessions. |

## SELF-LEARN (prompt 2 of 3)

| Item | Status |
|---|---|
| Auto-suppression after 3 skips | BUILT | Entity skip penalty in scorer (`557634e`). Commitment suppression after 3 skips in execute-action. |
| Auto-lift on approval of suppressed entity | BUILT | signal-processor.ts clears suppressed_at on new signal for same promisor_id. |

## SELF-OPTIMIZE (prompt 3 of 3)

| Item | Status |
|---|---|
| Dynamic threshold adjustment | NOT STARTED |
| Per-user threshold in DB | NOT STARTED |
| Weekly approval rate check | NOT STARTED |

## WHAT MUST BE TRUE BEFORE FOLDERA IS "SHIPPED"

1. Email arrives every morning without human intervention (3 consecutive days)
2. self-heal.ts runs and logs all 6 defenses every night
3. acceptance-gate.ts passes after every nightly run
4. A stranger can sign up and get their first email next morning
5. Stripe test payment completes e2e
6. Slim wait_rationale, not the bloated one
