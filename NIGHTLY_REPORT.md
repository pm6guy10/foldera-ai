# NIGHTLY REPORT — 2026-03-21
**Run time:** ~07:00 UTC
**Orchestrator:** Claude nightly-ops

---

## Overall Status: YELLOW — No directive sent, generator blocked by placeholder validation (day 2)

Same failure pattern as March 20. The `make_decision` winner is redirected to a document artifact, the LLM produces placeholder text, validation blocks correctly. No email sent. This is a correct no-send per product contract, but the pattern has persisted for 8+ consecutive runs. Signal processing also hit a new JSON parse error stalling 156 signals.

---

## Phase Results

| Phase | Status | Detail |
|-------|--------|--------|
| 1. Data Sync (Microsoft) | OK | 76 mail + 17 calendar signals synced for 1 user. No token or decrypt errors. |
| 2. Signal Processing | PARTIAL | Started with 186 unprocessed. Processed 30 in batch 1. Stalled at 156 remaining (0 processed in batches 2-3). JSON parse error in daily-brief signal processing path. |
| 3. Queue Cleanup | OK | No pending_approval rows older than 24h. Nothing to expire. |
| 4. Daily Brief Generation | NO-SEND | 102 candidates. Winner: compound `make_decision` (score 0.55, career domain). Redirected to `document`. LLM produced placeholder text. Validation blocked correctly. Reused earlier no-send result. |
| 5. Daily Send | SKIPPED | No valid pending_approval to send. |
| 6. Health Snapshot | OK | `npm run build` PASS. 28 commits in last 24h. |

---

## Data Summary

| Metric | Value |
|--------|-------|
| Signals in last 24h | 429 (222 outlook, 141 gmail, 62 calendar, 4 docs) |
| Microsoft sync (this run) | 76 mail + 17 calendar |
| Unprocessed signals remaining | 156 (151 outlook, 4 calendar, 1 gmail) |
| Signal processing stall | Yes — JSON parse error, batches 2-3 returned 0 processed |
| Stale queue rows expired | 0 |
| Candidates discovered | 102 |
| Directive sent | No |
| No-send reason | `document content contains placeholder text` |

---

## 7-Day Directive History

| Date | Actions | Approved | Skipped | Executed |
|------|---------|----------|---------|----------|
| Mar 21 | 1 | 0 | 1 | 0 |
| Mar 20 | 1 | 0 | 1 | 0 |
| Mar 19 | 5 | 0 | 5 | 0 |
| Mar 18 | 6 | 0 | 6 | 0 |
| Mar 17 | 17 | 0 | 17 | 0 |
| Mar 16 | 26 | 0 | 26 | 0 |
| Mar 14 | 25 | 0 | 24 | 0 |
| **Total** | **92** | **0** | **90** | **2** |

**Approval rate: 0%.** Zero approvals in 8 days across 92 generated actions.

---

## Failure Classifications

| Code | Severity | Description |
|------|----------|-------------|
| BLOCKER_GENERATOR_VALIDATION | High | LLM produces placeholder text in document artifacts when `make_decision` candidates are redirected. 8+ consecutive failures. |
| WARN_SIGNAL_PROCESSING_STALL | Medium | 156 signals stuck unprocessed due to JSON parse error in extraction pipeline. New issue this run. |
| INFO_ZERO_APPROVAL_RATE | Critical (product) | Zero approvals in 8 days. Product loop not completing. |
| WARN_MAKE_DECISION_DOMINANCE | Medium | Scorer heavily favors `make_decision` (8+ consecutive winners) but these have ~0% artifact success rate. |
| BLOCKER_TOKEN_DECRYPT (NR2) | Low | Legacy-encrypted data unreadable. Non-blocking since fresh sync is healthy. |

---

## Blockers Requiring Human Action

1. **Generator placeholder text (AB1):** `make_decision` → document redirect consistently fails. Options: (a) allow `decision_frame` as a concrete artifact type, (b) redirect to `drafted_email` instead, (c) add scorer penalty for action types with high validation failure rates.

2. **Signal processing stall (AB6 — NEW):** JSON parse error stalls batch processing at 156 signals. Likely one or more signals with malformed encrypted content. Needs error isolation in the extraction pipeline.

3. **Zero approval rate (AB2):** Even valid directives get skipped. Verify email delivery and approve/skip deep-links in Resend dashboard.

4. **Legacy encryption key (AB3):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-auth Microsoft.

---

## Morning Recommendation

Two new observations since last night:

1. **Signal processing regression:** 156 signals are stuck. The JSON parse error is new — investigate whether a recent commit (28 in 24h) introduced a parsing change, or whether a signal with corrupt content is poisoning the batch.

2. **AB1 is now the singular blocker for email delivery.** The pipeline is otherwise healthy. The fastest unblock would be to allow `decision_frame` artifacts for `make_decision` winners, since the LLM produces those cleanly.

**Suggested first action:** Fix signal processing stall (AB6), then address AB1 generator redirect path.

---

## Build / Test Status

- `npm run build`: PASS (exit 0, all routes compiled)
- No code changes in Job 1
