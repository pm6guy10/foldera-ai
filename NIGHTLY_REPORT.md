# NIGHTLY REPORT — 2026-03-22
**Run time:** ~09:12 UTC
**Orchestrator:** Claude nightly-ops

---

## Overall Status: GREEN — Directive sent. First `calendar_event` artifact delivered. Email confirmed.

Today's pipeline completed end-to-end for Brandon. A `schedule`/`calendar_event` directive was generated (confidence 71, scorer EV 1.57), persisted as `pending_approval`, and emailed via Resend. This is the first successful email delivery of a concrete artifact since the generator rewrite.

Test user (22222222) correctly received `no_send` (no signals available) but failed on email send due to no verified recipient — expected for a synthetic test user.

Signal processing healthy: 70 processed across 2 rounds, 0 remaining.

---

## Phase Results

| Phase | Status | Detail |
|-------|--------|--------|
| 1. Data Sync (Microsoft) | OK | 43 mail + 15 calendar signals synced for 1 user. No token or decrypt errors. |
| 2. Signal Processing | OK | 70 unprocessed. Processed all across 2 rounds (50 + 20) to 0 remaining. No stalls. |
| 3. Queue Cleanup | OK | No pending_approval rows older than 24h. Nothing to expire. |
| 4. Daily Brief Generation | SENT | Brandon: `schedule`/`calendar_event`, confidence 71, scorer EV 1.57, 100 candidates scored, 3 surfaced. Test user: `no_send` (0 candidates). |
| 5. Daily Send | PARTIAL | Brandon: email sent (Resend ID `9e7dbe77-210d-47ee-b54a-da3a863df935`). Test user: failed (no verified email). |
| 6. Health Snapshot | OK | `npm run build` PASS. 14 commits in last 24h. |

---

## Data Summary

| Metric | Value |
|--------|-------|
| Microsoft sync (this run) | 43 mail + 15 calendar |
| Unprocessed signals remaining | 0 |
| Signal processing stall | None |
| Stale queue rows expired | 0 |
| Directive sent (Brandon) | Yes — `calendar_event` |
| Directive sent (test user) | No — no signals, no verified email |
| Resend ID | `9e7dbe77-210d-47ee-b54a-da3a863df935` |

---

## Today's Directive (Brandon)

| Field | Value |
|-------|-------|
| Action ID | `13b55097-a95d-4fa8-8daa-58cc86d67e74` |
| Action type | `schedule` |
| Artifact type | `calendar_event` |
| Directive text | Schedule a 30-minute block today to review Google account security settings and recent activity logs after granting Claude Drive access |
| Artifact title | Google Account Security Review |
| Artifact start | 2026-03-22T14:00:00 |
| Artifact end | 2026-03-22T14:30:00 |
| Confidence | 71 |
| Scorer EV | 1.57 |

**Artifact validation**: title ✓, start ✓, end ✓, description ✓ — all non-empty.

**Note**: Artifact is stored in `execution_result.artifact`, not in the `artifact` column (which is NULL). Pipeline reads from execution_result so this works, but the column discrepancy should be noted.

---

## Top Candidate Breakdown

| Field | Value |
|-------|-------|
| Candidate type | commitment |
| Source signal | "Check account activity and secure Google account due to Claude for Google Drive access grant" (2026-03-22) |
| Target goal | Check careers.wa.gov weekly for new MA4 postings |
| Stakes (raw → transformed) | 4 → 2.297 |
| Urgency (raw → effective) | 0.3 → 0.42 |
| Tractability | 0.5 |
| Exec potential (HM) | 0.457 |
| Behavioral rate | 0.5 (cold start) |
| Novelty | 1.0 |
| Suppression | 1.0 |
| **Final score** | **1.57** |

Candidates #2 and #3 scored 0.87 each (novelty penalty 0.55).

---

## 7-Day Action History

| Metric | Value |
|--------|-------|
| Total actions | 71 |
| Approved | 0 (0%) |
| Skipped | 69 |
| Executed | 1 |
| Pending | 2 (today's) |

**Action type breakdown (7 days):**
| Type | Count | Skipped | Other |
|------|-------|---------|-------|
| make_decision | 37 | 37 | 0 |
| do_nothing | 20 | 18 | 1 executed, 1 pending |
| send_message | 8 | 8 | 0 |
| research | 4 | 4 | 0 |
| write_document | 1 | 1 | 0 |
| schedule | 1 | 0 | 1 pending |

**make_decision share**: 37/71 = 52% (down from 66% on March 23 — pre-rewrite actions aging out).

**Approval rate: 0%.** Zero approvals in 11+ days. Today's calendar_event directive is the first concrete, artifact-valid directive in days — if approved, this breaks the streak.

---

## Failure Classifications

| Code | Severity | Description |
|------|----------|-------------|
| INFO_DIRECTIVE_SENT | Success | First successful directive email with concrete artifact since generator rewrite. |
| INFO_TEST_USER_NO_EMAIL | Low | Test user 22222222 has no verified email. Expected. HTTP 500 from daily-brief due to this. |
| INFO_ZERO_APPROVAL_RATE | Critical (product) | Zero approvals in 11+ days. Product loop not completing. Today's directive may break the streak. |
| INFO_ARTIFACT_COLUMN_NULL | Low | `tkg_actions.artifact` column is NULL; artifact stored in `execution_result.artifact`. Pipeline works but schema inconsistency exists. |
| WARN_MAKE_DECISION_DOMINANCE | Low (declining) | `make_decision` at 52% of 7-day actions, down from 66%. Pre-rewrite actions aging out. |
| BLOCKER_TOKEN_DECRYPT (NR2) | Low | Legacy-encrypted data unreadable. Non-blocking since fresh sync healthy. |

---

## Blockers Requiring Human Action

1. **Zero approval rate (AB2):** No approvals in 11+ days. Today's `calendar_event` directive was sent — check email and test approve deep-link. If the directive quality looks good, approve it to break the 0% streak and feed the behavioral rate.

2. **Test user email (NEW):** Test user `22222222` causes HTTP 500 on daily-brief because no verified email exists. Either add a real email for the test user or filter synthetic users from the send path.

3. **Legacy encryption key (AB3):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-auth Microsoft. Low priority.

---

## Morning Recommendation

**The pipeline is working end-to-end.** Today's run produced a valid `calendar_event` artifact, passed validation, and delivered the email. This is a significant milestone.

**Suggested actions:**
1. Check email and approve/skip today's directive. An approval will feed the behavioral rate and improve future scoring.
2. Decide whether to configure the test user with a real email or filter it from the send path to avoid HTTP 500.
3. AB3 (legacy encryption) remains low priority.

---

## Build / Test Status

- `npm run build`: PASS
- No code changes in Job 1
