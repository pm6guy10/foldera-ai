# NIGHTLY REPORT — 2026-03-20
**Run time:** ~02:00–02:20 UTC
**Orchestrator:** Claude nightly-ops

---

## Overall Status: PARTIAL — No directive sent

The pipeline ran end-to-end. Data sync succeeded, all signals processed, queue clean. Generation found 102 candidates but the top candidate's artifact failed placeholder validation. No email was sent today.

---

## Phase Results

| Phase | Status | Detail |
|-------|--------|--------|
| 1. Data Sync (Microsoft) | OK | 76 mail + 16 calendar signals synced for 1 user. No token or decrypt errors. |
| 2. Signal Processing | OK | 232 unprocessed signals drained to 0 across 5 batches (50 each). No stale backlog. |
| 3. Queue Cleanup | OK | No pending_approval rows older than 24h. Nothing to expire. |
| 4. Daily Brief Generation | NO-SEND | 102 candidates. Winner: compound `make_decision` (score 0.55, career domain). Generator redirected to `document` type. LLM produced placeholder text. Validation blocked correctly. Explicit no-send persisted. |
| 5. Daily Send | SKIPPED | No valid pending_approval to send. |
| 6. Health Snapshot | OK | Build passes (after `.next` cache clean). 25 commits in last 24h. No new audit-tracked regressions. |

---

## Data Summary

| Metric | Value |
|--------|-------|
| Microsoft mail signals synced | 76 |
| Microsoft calendar signals synced | 16 |
| Signals processed tonight | 232 |
| Unprocessed signals remaining | 0 |
| Stale queue rows expired | 0 |
| Candidates discovered | 102 |
| Directive sent | No |
| No-send reason | `document content contains placeholder text` |

---

## 7-Day Directive History

| Date | Actions | Sent | Approved | Skipped |
|------|---------|------|----------|---------|
| Mar 20 | 1 | 0 | 0 | 1 |
| Mar 19 | 5 | 4 | 0 | 5 |
| Mar 18 | 6 | 2 | 0 | 6 |
| Mar 17 | 17 | 5 | 0 | 17 |
| Mar 16 | 26 | 0 | 0 | 26 |
| Mar 14 | 25 | 0 | 0 | 24 |
| Mar 13 | 12 | 0 | 0 | 11 |
| **Total** | **92** | **11** | **0** | **90** |

**Approval rate: 0%.** This is the most important signal in this report. The end-to-end product loop has never completed with a user approval in the last 7 days.

---

## Failure Classifications

| Code | Severity | Description |
|------|----------|-------------|
| BLOCKER_GENERATOR_VALIDATION | High | LLM produces placeholder text in document artifacts for redirected `make_decision` candidates. Validation catches it correctly, but no fallback produces a valid artifact. |
| INFO_ZERO_APPROVAL_RATE | Critical (product) | Zero approvals in 7 days across 11 sent directives. Product loop not completing. |
| BLOCKER_TOKEN_DECRYPT (NR2) | Medium | Legacy-encrypted Microsoft data still unreadable. Non-blocking for generation but reduces context quality. |

---

## Blockers Requiring Human Action

1. **Generator placeholder text (AB1):** The `make_decision` → document redirect path consistently produces placeholder content. Consider:
   - Redirecting `make_decision` to `drafted_email` instead of `document` (higher LLM success rate historically)
   - Adding few-shot examples for document artifacts in the generator prompt
   - Allowing the generator to try `send_message` as fallback before giving up

2. **Zero approval rate (AB2):** 11 directives sent, 0 approved in 7 days. Investigate:
   - Are emails reaching the inbox? (Check Resend delivery logs)
   - Do approve/skip deep-links in the email work?
   - Is the directive content actually actionable?
   - Is the user engaging with the product at all?

3. **Legacy encryption key (AB3/NR2):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-authorize Microsoft OAuth.

---

## Morning Recommendation

The pipeline infrastructure is healthy — sync, processing, and validation all work correctly. The two problems are:

1. **Quality:** The generator can't produce clean artifacts for `make_decision` candidates. This is the #1 code fix needed.
2. **Engagement:** Zero approvals suggests either the directives aren't reaching Brandon, or they aren't useful enough to approve. This needs manual investigation before more code changes.

**Suggested first action:** Check Resend dashboard for delivery status of the 11 sent emails. If they're reaching the inbox and being ignored, the problem is directive quality. If they're not reaching the inbox, the problem is email delivery.

---

## Build / Test Status

- `npm run build`: PASS (after `.next` cache clean)
- No new code changes in this session
