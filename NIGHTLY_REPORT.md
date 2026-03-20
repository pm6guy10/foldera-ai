# NIGHTLY REPORT — 2026-03-20
**Run time:** ~02:00 UTC (cron) + re-verified ~07:00 UTC (second orchestrator pass)
**Orchestrator:** Claude nightly-ops

---

## Overall Status: YELLOW — No directive sent, generator blocked by placeholder validation

The pipeline ran end-to-end. Data sync succeeded, all signals processed, queue clean. Generation found 102 candidates but the top candidate's artifact failed placeholder validation. No email was sent today. This is a correct no-send per product contract.

---

## Phase Results

| Phase | Status | Detail |
|-------|--------|--------|
| 1. Data Sync (Microsoft) | OK | 76 mail + 16 calendar signals synced for 1 user. No token or decrypt errors. Fresh signals last 2h: 152 outlook + 32 outlook_calendar. |
| 2. Signal Processing | OK | 0 unprocessed signals remaining (previous run drained 232 to 0). |
| 3. Queue Cleanup | OK | No pending_approval rows older than 24h. Nothing to expire. |
| 4. Daily Brief Generation | NO-SEND | 102 candidates. Winner: compound `make_decision` (score 0.55, career domain). Generator redirected to `document` type. LLM produced placeholder text. Validation blocked correctly. Explicit no-send persisted. |
| 5. Daily Send | SKIPPED | No valid pending_approval to send. |
| 6. Health Snapshot | OK | `npm run build` PASS (exit 0). 27 commits in last 24h — heavy generator iteration. |

---

## Data Summary

| Metric | Value |
|--------|-------|
| Signals in last 24h | 336 (146 outlook, 140 gmail, 46 calendar, 4 docs) |
| Microsoft sync (this run) | 76 mail + 16 calendar |
| Unprocessed signals remaining | 0 |
| Stale queue rows expired | 0 |
| Candidates discovered | 102 |
| Directive sent | No |
| No-send reason | `document content contains placeholder text` |

---

## 7-Day Directive History

| Date | Actions | Approved | Skipped | Pending |
|------|---------|----------|---------|---------|
| Mar 20 | 1 | 0 | 1 | 0 |
| Mar 19 | 5 | 0 | 5 | 0 |
| Mar 18 | 6 | 0 | 6 | 0 |
| Mar 17 | 17 | 0 | 17 | 0 |
| Mar 16 | 26 | 0 | 26 | 0 |
| Mar 14 | 25 | 0 | 24 | 0 |
| Mar 13 | 12 | 0 | 11 | 0 |
| **Total** | **92** | **0** | **90** | **0** |

**Approval rate: 0%.** Zero approvals in 7 days across 92 generated actions. The product loop is not completing.

---

## Scorer Pattern (Last 8 Runs)

| Date | Winner Type | Score | Candidates | Outcome |
|------|------------|-------|------------|---------|
| Mar 20 01:58 | make_decision | 0.55 | 102 | no_send (placeholder) |
| Mar 19 15:30 | make_decision | 0.13 | 101 | no_send |
| Mar 19 15:01 | send_message | 0.75 | 101 | skipped (conf 74) |
| Mar 19 14:45 | make_decision | 0.81 | 102 | skipped (conf 72) |
| Mar 19 14:05 | make_decision | 0.82 | 101 | skipped (conf 74) |
| Mar 19 04:32 | research | 1.01 | 88 | skipped (conf 73) |
| Mar 18 21:25 | make_decision | 0.98 | 82 | skipped (conf 77) |
| Mar 18 16:39 | make_decision | 2.68 | 71 | skipped (conf 81) |

`make_decision` wins 6/8 runs. When `send_message` won (Mar 19 15:01), it produced a valid artifact with confidence 74 but was skipped by the user.

---

## Failure Classifications

| Code | Severity | Description |
|------|----------|-------------|
| BLOCKER_GENERATOR_VALIDATION | High | LLM produces placeholder text in document artifacts when `make_decision` candidates are redirected. Validation catches correctly, but no fallback produces a valid artifact. |
| INFO_ZERO_APPROVAL_RATE | Critical (product) | Zero approvals in 7 days. Product loop not completing. |
| WARN_MAKE_DECISION_DOMINANCE | Medium | Scorer heavily favors `make_decision` (6/8 recent winners) but these have the lowest artifact success rate. |
| BLOCKER_TOKEN_DECRYPT (NR2) | Low | Legacy-encrypted data unreadable. Non-blocking since fresh sync is healthy. |

---

## Blockers Requiring Human Action

1. **Generator placeholder text (AB1):** The `make_decision` to document redirect path consistently produces placeholder content. 27 commits in 24h have been iterating. Options: (a) redirect `make_decision` to `drafted_email` instead of `document`, (b) add few-shot document examples, (c) suppress `make_decision` in scorer when historical validation failure rate is high.

2. **Zero approval rate (AB2):** Even when valid directives are produced (e.g., Mar 19 send_message at conf 74), they are skipped. Need to verify: are emails reaching the inbox? Are approve/skip deep-links working? Is directive content actionable?

3. **Legacy encryption key (AB3/NR2):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-auth Microsoft.

---

## Morning Recommendation

Pipeline infrastructure is healthy. The two problems are complementary:

1. **Generator quality**: `make_decision` winners fail artifact validation. The one `send_message` winner that passed produced a real email — suggesting the fix is either to steer the scorer toward `send_message` candidates or improve the `make_decision` → document prompt.

2. **User engagement**: Even valid directives get skipped, not approved. Before more generator work, verify email delivery and link functionality.

**Suggested first action:** Check Resend dashboard for delivery status. If emails reach the inbox, the problem is directive quality/relevance.

---

## Build / Test Status

- `npm run build`: PASS (exit 0, 22 static pages, all API routes compiled)
- No code changes in Job 1
