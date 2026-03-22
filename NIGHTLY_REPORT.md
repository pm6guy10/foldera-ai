# NIGHTLY REPORT — 2026-03-22 (evening audit)
**Run time:** ~20:30 UTC
**Auditor:** Claude Code (full system health check)

---

## Overall Status: YELLOW — Pipeline functional, directive quality stagnant, zero approvals in 12+ days

The pipeline runs end-to-end. Cron fires, sync works, signals process, directives generate, emails send. But every directive produced in the last 7 days was skipped (76/76). The product loop is not completing. Self-referential commitment leaks (15 active) continue to pollute the scorer. Goals with `current_priority=true` are only the 3 suppression goals — the 11 real goals all have `current_priority=false`, which may affect identity context in the generator.

---

## CHECK 1: AUTH HEALTH — GREEN

| Item | Status | Detail |
|------|--------|--------|
| RPC `get_auth_user_id_by_email` | PASS | Returns `e40b7cd8` for `b-kapp@outlook.com` |
| Google token | VALID | Expires in ~30 min (normal short-lived OAuth). Last synced: 2026-03-22 15:07 UTC |
| Microsoft token | VALID | Expires in ~56 min (normal short-lived OAuth). Last synced: 2026-03-22 19:58 UTC |
| Providers connected | 2/2 | Google + Microsoft both active |

**Note:** Token expiry within the hour is normal — OAuth access tokens are short-lived and refresh automatically on use. The token watchdog in self-heal handles pre-cron refresh.

---

## CHECK 2: DATA HEALTH — GREEN

| Source | Count | Latest Signal |
|--------|-------|---------------|
| outlook | 630 | 2026-03-22 |
| outlook_calendar | 541 | 2026-04-04 (future events) |
| uploaded_document | 371 | 2026-03-22 |
| claude_conversation | 242 | 2026-03-20 |
| gmail | 144 | 2026-03-20 |
| chatgpt_conversation | 37 | 2026-03-18 |
| **Total** | **1,965** | |

| Metric | Value |
|--------|-------|
| Unprocessed signals | 0 |
| Signal backlog | Clear |

**Note:** Gmail last synced March 20 — 2 days stale. Google sync should be running nightly. Claude/ChatGPT conversations are uploaded documents, not auto-syncing, so staleness there is expected.

---

## CHECK 3: COMMITMENT HEALTH — YELLOW

| Metric | Value | Threshold |
|--------|-------|-----------|
| Active commitments | 112 | 150 ceiling |
| Self-referential leaks | **15** | 0 target |

All 15 self-referential commitments are Foldera deployment/infrastructure items (e.g., "Fix failed production deployments on foldera-ai", "Review and fix security vulnerabilities in Supabase project 'Foldera'"). These are `source=signal_extraction` — the extraction pipeline is creating commitments from Vercel notification emails that got ingested as signals.

**Impact:** These leak into the scorer and can produce infrastructure-focused directives. The `SYSTEM_INTROSPECTION_PATTERNS` constraint should catch most at generation time, but they waste scorer slots.

---

## CHECK 4: GOAL HEALTH — YELLOW

| Priority | Count | Goals |
|----------|-------|-------|
| 5 (highest) | 4 | MA4 role, ESD follow-up (March 27), MAS3 at HCA, Financial stability |
| 4 | 3 | MAS3 onboarding prep (April 1), Family stability, MA4 weekly check (March 28) |
| 3 | 2 | SQL/PMP credentials, Reference slate |
| 2 | 2 | ESD overpayment, Foldera (overflow only) |
| 1 (suppression) | 3 | FPA3, Keri Nopens, Mercor |
| **Total** | **14** | |

**Issues found:**
1. **All `current_priority = false` except suppressions.** The 3 suppression goals (priority 1) are `current_priority = true`. The 11 real goals are all `false`. This may affect `buildUserIdentityContext()` which queries `current_priority = true` goals — if it only reads those, the generator gets suppression context but no positive identity context.
2. **Stale date references:** "Follow up on ESD overpayment waiver by phone on March 27" and "Check careers.wa.gov weekly — Next check: March 28" have dates that are approaching. These are still valid as of today (March 22).

---

## CHECK 5: DIRECTIVE QUALITY — RED

### Last 5 non-do_nothing actions (all skipped):

| Date | Type | Directive (truncated) | Confidence | Status |
|------|------|-----------------------|------------|--------|
| Mar 22 | write_document | Document why credit monitoring can wait until after the MA4 search cycle | 75 | skipped |
| Mar 22 | schedule | Schedule a 30-minute block this week to check your credit score | 66 | skipped |
| Mar 22 | schedule | Schedule a 30-minute block today to review Google account security settings | 71 | skipped |
| Mar 22 | schedule | Schedule a 30-minute block today to review Google account security settings | 71 | skipped |
| Mar 21 | send_message | Gate 1 test: confirm email delivery pipeline | 85 | skipped |

### Last 5 do_nothing actions (all skipped):

| Date | Directive | Confidence |
|------|-----------|------------|
| Mar 22 | Wait for DSHS to complete their review process... | 70 |
| Mar 22 | Nothing cleared the bar today — 97 candidates evaluated | 45 |
| Mar 22 | Nothing cleared the bar today — 101 candidates evaluated | 45 |
| Mar 22 | Nothing cleared the bar today — 101 candidates evaluated | 45 |
| Mar 22 | Nothing cleared the bar today — 101 candidates evaluated | 45 |

### 7-day action breakdown:

| Type | Count | % |
|------|-------|---|
| make_decision | 37 | 49% |
| do_nothing | 22 | 29% |
| send_message | 8 | 11% |
| research | 4 | 5% |
| schedule | 3 | 4% |
| write_document | 2 | 3% |
| **Total** | **76** | **0% approved** |

**Assessment:** Directive quality is stagnant. The generator consistently produces:
- Credit score / Google security housekeeping (noise)
- "Nothing cleared the bar" do_nothing (correct but not useful)
- DSHS wait_rationale (correct and relevant but not actionable)

Zero approvals in 12+ days. The `make_decision` type still dominates at 49% (down from 52% last report — pre-rewrite actions aging out). The product loop is not completing.

---

## CHECK 6: PIPELINE INTEGRITY — GREEN

| Component | Status | Detail |
|-----------|--------|--------|
| vercel.json crons | MATCH | `nightly-ops` at `0 11 * * *`, `health-check` at `0 15 * * *` — matches CLAUDE.md |
| nightly-ops stages | ALL PRESENT | 1a. stageSyncMicrosoft, 1b. stageSyncGoogle, 2. stageProcessSignals, 3. passive_rejection, 4. daily_brief, 5. self_heal, 6. acceptance_gate |
| acceptance-gate.ts | ALL 7 CHECKS | AUTH, TOKENS, SIGNALS, COMMITMENTS, GENERATION, DELIVERY, SESSION |
| Latest cron fire | Mar 22 09:12 UTC | Directive generated and emailed |
| Latest action | Mar 22 20:00 UTC | Manual triggers during the day |

---

## CHECK 7: SPEC RECONCILIATION

| Item | Current Status | Should Be | Reason |
|------|---------------|-----------|--------|
| 1.1 "Email sends every morning" | BUILT | PROVEN | Cron has been firing daily. Multiple Resend IDs confirmed. Upgrade. |
| 1.1 "Cron fires at 4am PT" | BUILT | PROVEN | vercel.json confirmed, actions generated daily at ~09:12-11:xx UTC. |
| 1.1 "Real directive email" | BLOCKED | YELLOW | Directives generate and send, but all are skipped. Quality is the issue, not delivery. |
| 1.2 All self-heal defenses | BUILT | BUILT | Cannot upgrade without Vercel log evidence of self-heal running. Keep BUILT. |
| 1.5 Acceptance gate items | BUILT | BUILT | Same — need Vercel log evidence. Keep BUILT. |
| 2.3 "Directive quality: housekeeping eliminated" | PROVEN | REGRESSED | Credit score and Google security directives are housekeeping. The filter is not catching them. |

---

## CHECK 8: BACKLOG RECONCILIATION

| # | Current | Should Be | Reason |
|---|---------|-----------|--------|
| AB1 | OPEN | CLOSE-CANDIDATE | `make_decision` share at 49% (down from 66%). Pre-rewrite actions aging out. Last 3 days show schedule/write_document/do_nothing, not make_decision placeholders. Monitor 3 more days then close. |
| AB2 | OPEN | OPEN (CRITICAL) | Zero approvals in 12+ days. 76 actions, 76 skipped. No change. |
| AB3 | OPEN | OPEN (LOW) | Legacy encryption still unresolved. Non-blocking since fresh sync healthy. |
| AB4 | OPEN | CLOSE-CANDIDATE | Same trajectory as AB1 — aging out. |
| AB7 | OPEN | OPEN | Top scores still below 2.0 benchmark. Generator confidence gates at 70, which works. Informational only. |
| AB13 | OPEN | OPEN | Google Calendar/Drive still at 0 signals. Needs re-auth with scopes. |
| NEW: AB15 | — | OPEN | 15 self-referential commitments (Foldera deployment/infra). Need suppression. |
| NEW: AB16 | — | OPEN | All real goals have `current_priority=false`. Generator identity context may be empty. |

---

## Blockers Requiring Human Action

1. **Zero approval rate (AB2, CRITICAL):** 12+ days, 76 actions, 0 approved. The behavioral rate is stuck at cold-start 0.50. The product loop cannot self-improve without at least one approval.

2. **Self-referential commitment leaks (AB15, MEDIUM):** 15 active commitments about Foldera infrastructure. Need suppression SQL or extraction filter update.

3. **Goal current_priority mismatch (AB16, MEDIUM):** Only suppression goals are `current_priority=true`. Real goals (MA4, MAS3, family stability) are `false`. Generator identity context may be starved.

4. **Google Calendar/Drive (AB13, LOW):** Still 0 signals. Needs re-auth with calendar+drive scopes.

---

## Morning Recommendation

**The pipeline works. The quality doesn't.** The single highest-priority action is to either:
- Approve one good directive to break the 0% approval rate and let the self-learning loop activate, OR
- Fix the `current_priority` flags on real goals so the generator gets proper identity context

---

## Build / Test Status

- `npm run build`: Not run (audit-only session, no code changes)
- No code changes in this audit
