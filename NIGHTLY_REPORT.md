# NIGHTLY REPORT — 2026-03-23
**Run time:** ~09:12 UTC
**Orchestrator:** Claude nightly-ops

---

## Overall Status: YELLOW — No directive sent. Scorer rate floor working but top candidate (1.91) just below threshold (2.0). Signal processing clean.

The scorer rate floor fix (`4d88228`) is now live and working correctly. Pre-rewrite skips no longer zero out behavioral rates. The top candidate (send_message about MAS3/Keri Nopens follow-up) scored 1.91 — the closest a candidate has come to threshold (2.0) in days. The bottleneck is urgency_raw=0.3, which drags exec_potential down to 0.485. If a higher-urgency signal arrives (deadline, reply, calendar event), the scorer should produce a passing score.

Signal processing healthy: 80 processed across 2 batches, 0 remaining.

---

## Phase Results

| Phase | Status | Detail |
|-------|--------|--------|
| 1. Data Sync (Microsoft) | OK | 32 mail + 14 calendar signals synced for 1 user. No token or decrypt errors. |
| 1. Data Sync (Google) | OK | 0 new signals (no new data in inbox/calendar). |
| 2. Signal Processing | OK | 80 unprocessed (all < 24h). Processed all 80 across 2 batches to 0 remaining. No stalls. |
| 3. Queue Cleanup | OK | No pending_approval rows older than 24h. Nothing to expire. |
| 4. Daily Brief Generation | NO-SEND | Confidence below threshold. Top candidate: send_message (MAS3/Keri Nopens), score 1.91 < 2.0. Urgency 0.3 is the drag. 100 candidates scored, 3 surfaced. |
| 5. Daily Send | SKIPPED | No valid pending_approval. INFO_NOT_SENT_NO_VALID_DIRECTIVE. |
| 6. Health Snapshot | OK | `npm run build` PASS (after .next cache clear). 20 commits in last 24h. |

---

## Data Summary

| Metric | Value |
|--------|-------|
| Microsoft sync (this run) | 32 mail + 14 calendar |
| Google sync (this run) | 0 (no new data) |
| Unprocessed signals remaining | 0 |
| Signal processing stall | None |
| Stale queue rows expired | 0 |
| Directive sent | No |
| No-send reason | Top candidate score 1.91 < threshold 2.0 (urgency 0.3) |

---

## Top Candidate Breakdown

| Field | Value |
|-------|-------|
| Action type | send_message |
| Target goal | Land MAS3 position at HCA |
| Candidate type | commitment |
| Source signal | "Reach out to Keri Nopens to check on MAS3 hiring timeline" (2026-03-19) |
| Stakes (raw → transformed) | 5 → 2.627 |
| Urgency (raw → effective) | 0.3 → 0.47 |
| Tractability | 0.5 |
| Exec potential (HM) | 0.485 |
| Behavioral rate | 0.5 (cold start) |
| Novelty | 1.0 |
| Suppression | 1.0 |
| **Final score** | **1.91** (threshold: 2.0) |

Candidates #2 and #3 were make_decision type with entity penalty -30 (suppression multiplier ~3e-7), effectively zeroed.

---

## 7-Day Action History

| Metric | Value |
|--------|-------|
| Total actions | 85 |
| Approved | 0 (0%) |
| Skipped | 84 |
| Executed | 1 |
| Pending | 0 |

**Action type breakdown (7 days):**
| Type | Count | Approved | Skipped | Avg Conf |
|------|-------|----------|---------|----------|
| make_decision | 56 | 0 | 55 | 47.8 |
| do_nothing | 13 | 0 | 13 | 16.3 |
| send_message | 8 | 0 | 8 | 55.8 |
| research | 7 | 0 | 7 | 29.4 |
| write_document | 1 | 0 | 1 | 73.0 |

**Approval rate: 0%.** Zero approvals in 10+ days.

---

## Failure Classifications

| Code | Severity | Description |
|------|----------|-------------|
| INFO_SCORE_BELOW_THRESHOLD | Medium | Top candidate scored 1.91 vs threshold 2.0. Urgency 0.3 is the constraint. Not a bug — scorer is correctly gating low-urgency candidates. |
| INFO_ZERO_APPROVAL_RATE | Critical (product) | Zero approvals in 10+ days. Product loop not completing. |
| WARN_MAKE_DECISION_DOMINANCE | Medium | `make_decision` still 66% of all actions (56/85) with 0% approval/artifact success. |
| BLOCKER_TOKEN_DECRYPT (NR2) | Low | Legacy-encrypted data unreadable. Non-blocking since fresh sync is healthy. |

---

## Blockers Requiring Human Action

1. **Score threshold gap (NEW):** Top candidate scores 1.91, threshold is 2.0. The bottleneck is urgency (0.3 for a 4-day-old commitment). Options: (a) lower threshold from 2.0 to 1.8, (b) adjust urgency calculation for commitment-type candidates, (c) wait for a naturally higher-urgency signal (deadline, reply).

2. **Zero approval rate (AB2):** No approvals in 10+ days. Even valid directives (conf 73 send_message on Mar 20) get skipped. Check if emails are being delivered and deep-links work. The product loop is stuck.

3. **Legacy encryption key (AB3):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-auth Microsoft.

---

## Morning Recommendation

**The scorer rate floor fix is working.** Pre-rewrite skip history no longer zeros scores. The top candidate reached 1.91 — the highest score in days.

**The gap is now urgency, not rate.** The MAS3/Keri Nopens follow-up has urgency 0.3 because it's a commitment without a hard deadline. When a time-sensitive signal arrives (meeting tomorrow, reply received, application deadline), the scorer should produce a 2.0+ score and the directive pipeline will complete.

**Suggested actions:**
1. Consider lowering threshold from 2.0 to 1.8 if the 1.91 candidate quality looks good — it was "email Keri Nopens to check on MAS3 hiring timeline."
2. Check Resend dashboard for email delivery of recent directives.
3. AB3 (legacy encryption) is low priority but should be resolved eventually.

---

## Build / Test Status

- `npm run build`: PASS (local .next cache needed clearing for memory — not a code issue)
- No code changes in Job 1
