# FOLDERA MASTER AUDIT — Single Source of Truth
**Updated:** March 16, 2026
**Last Verified Fix:** March 16, 2026 — `ed2d35b`
**Scope:** Read-only full audit of `app/`, `lib/`, `components/`, `scripts/`, and `supabase/`
**Source:** Codex full audit + CC audit

---

## CRITICAL — Fix before any user touches the product

| # | Issue | Source | Status |
|---|-------|--------|--------|
| C1 | `app/api/cron/daily-generate/route.ts:97-133` catches artifact failures, calls `getFallbackArtifact()`, and still inserts `draft_rejected`/`generated` rows with incomplete work products, so the daily brief can persist artifacts the user cannot actually approve; blocks the vision. | Codex full audit | FIXED — March 16, 2026, commit `ed2d35b` |
| C2 | `lib/conviction/execute-action.ts:335-357` marks actions as `executed` and writes approval feedback even when there is no artifact or execution returned an `exec_error`, which reports finished work when nothing was actually done; blocks the vision. | Codex full audit | FIXED — March 16, 2026, commit `ed2d35b` |
| C3 | `lib/conviction/artifact-generator.ts:372-470`, `app/api/conviction/generate/route.ts:61-89`, and `app/api/onboard/free-directive/route.ts:58-84` turn model/parse failures into placeholder artifacts with empty fields and then persist them anywhere a caller only checks for non-null, so broken emails/documents/decisions still enter `tkg_actions`; blocks the vision. | Codex full audit | FIXED — March 16, 2026, commit `ed2d35b` |
| C4 | `lib/auth/resolve-user.ts:15-24` accepts `x-ingest-secret` on session routes, so anyone with `INGEST_API_KEY` can approve/skip/execute as the owner. Close the ingest-secret path on all non-cron routes. | CC audit | FIXED — March 16, 2026, commit `ed2d35b` |

## HIGH — Fix before inviting waitlist

| # | Issue | Source | Status |
|---|-------|--------|--------|
| H1 | `lib/encryption.ts:45-64`, `lib/briefing/scorer.ts:369-379,476,628,1537-1554`, `lib/conviction/artifact-generator.ts:72-88`, and `lib/signals/summarizer.ts:93-99` treat decrypt fallback output as valid plaintext instead of skipping bad rows, so ciphertext can leak into scoring, artifact prompts, and weekly summaries; blocks the vision. | Codex full audit | OPEN |
| H2 | `app/api/stripe/webhook/route.ts:59-72,93-141`, `lib/auth/subscription.ts:69-82`, and `components/dashboard/trial-banner.tsx:27-38` mark checkout-created rows as healthy paid `active/pro` subscriptions before billing succeeds and then hide the banner accordingly, which breaks trial gating and paywall state. | Codex full audit | OPEN |
| H3 | `app/api/onboard/my-directive/route.ts:23-31` returns the most recent `pending_approval` action for the user instead of the onboarding directive, so the onboarding result page can show a later daily action rather than the promised first read; blocks the vision. | Codex full audit | OPEN |
| H4 | `app/start/page.tsx:30-65` starts onboarding with OAuth and promises “Nothing is stored permanently until you subscribe” even though onboarding immediately persists tokens/signals elsewhere in the flow, which contradicts the value-before-auth rule and user trust; blocks the vision. | Codex full audit | OPEN |
| H5 | `components/dashboard/draft-queue.tsx:10-12,160-189,346-423` turns pending work into an editable email composer and raw payload viewer, so approval requires the user to rewrite or inspect the artifact instead of just approve/skip; blocks the vision. | Codex full audit | OPEN |
| H6 | `components/dashboard/conviction-card.tsx:257-268,293-327,423-443` adds evidence panels, post-execution outcome prompts, and skip-reason pickers to the main directive card, violating the one-tap approve/skip contract on the core dashboard surface; blocks the vision. | Codex full audit | OPEN |
| H7 | `lib/briefing/generator.ts:141-150,267-293,429-430` still emits internal-score `do_nothing` copy, Brandon-specific “copy-paste this reply” growth artifacts, and a Brandon-only stale-term blacklist, so the generator is neither user-agnostic nor finished-work-only; blocks the vision. | Codex full audit | OPEN |
| H8 | `lib/briefing/generator.ts:146-160`, `lib/briefing/scorer.ts:1450,1820-1839`, `app/api/cron/daily-generate/route.ts:92-103,153`, `app/api/cron/daily-send/route.ts:116`, and `app/api/conviction/outcome/route.ts:119` still log titles, scores, outcomes, and user identifiers to stdout, which is cleanup with high privacy risk. | Codex full audit | OPEN |
| H9 | `app/start/result/ResultClient.tsx:188-223` shows confidence percentages plus evidence/full-context on the first real directive experience, even though confidence is supposed to stay internal and the surface should center the finished artifact; blocks the vision. | Codex full audit | OPEN |
| H10 | `app/api/cron/daily-generate/route.ts:136` logs a save error but still returns success, so a generated directive can be lost silently during cron execution. | CC audit | FIXED — March 16, 2026, commit `ed2d35b` |
| H11 | `components/dashboard/conviction-card.tsx:122` says “That pattern will be deprioritized.” even though `BRANDON.md` disallows guilt messaging on the core dashboard surface. | CC audit | FIXED — March 16, 2026, commit `ed2d35b` |

## MEDIUM — Fix before measuring retention

| # | Issue | Source | Status |
|---|-------|--------|--------|
| M1 | `app/api/onboard/email-sync/route.ts:50-58`, `app/api/onboard/gmail-sync/route.ts:56-77`, and `app/api/onboard/thin-ingest/route.ts:19-40` ignore Supabase `error` values during density checks and continue with `0`/`null` data, so onboarding can misclassify users as `thin`, `very_thin`, or `ready` after database failures; blocks the vision. | Codex full audit | OPEN |
| M2 | `app/api/try/analyze/route.ts:61-79,128-135`, `app/page.tsx:538-549,642-682`, and `app/try/page.tsx:240-250,344-385` still frame the demo around visible confidence meters and evidence readouts, which conflicts with the product rule that confidence stays internal; cleanup. | Codex full audit | OPEN |
| M3 | `app/dashboard/signals/page.tsx:75-216` makes a dashboard destination out of ingestion telemetry (“Everything Foldera has read and processed”) instead of finished artifacts, pushing the product toward a monitoring tool rather than an execution engine; cleanup. | Codex full audit | OPEN |
| M4 | `lib/utils/api-tracker.ts:43-57,64-125` silently swallows tracking failures and computes caps without a user filter, while `app/api/settings/spend/route.ts:21-25` turns errors into a fake zero-spend success payload, so one user can affect another and the settings UI can silently lie; cleanup. | Codex full audit | OPEN |
| M5 | `app/api/onboard/universal-directive/route.ts:4-145` is a public, apparently unused route that fabricates a generic “personalized” directive from `INGEST_USER_ID` data with hardcoded 91% confidence and uppercase action labels, which is off-brand, owner-coupled, and a latent contract mismatch; cleanup. | Codex full audit | OPEN |
| M6 | `scripts/generate-briefing.mjs:223-233,402-410,536-555,915-953` is a stale manual script that ignores decrypt fallback, logs private scoring output, and writes directly into `tkg_actions`/`tkg_briefings` outside the supported app flow, creating operational risk if anyone runs it against production; cleanup. | Codex full audit | OPEN |
| M7 | `lib/conviction/__tests__/execute-action.test.ts:244-252` codifies the current “no artifact still counts as executed” bug, so the test suite will fight the correct fix instead of protecting it; cleanup. | Codex full audit | FIXED — March 16, 2026, commit `ed2d35b` |
| M8 | `lib/briefing/types.ts` still exposes an `affirmation` artifact path for `do_nothing`, but approving it only records a wait rationale instead of producing a finished external artifact. Remove the type or replace it with a finished-work contract. | CC audit | OPEN |

## LOW — Cleanup when stable

| # | Issue | Source | Status |
|---|-------|--------|--------|
| L1 | A repo-wide symbol search found no in-tree callers for `components/dashboard/briefing-card.tsx:12`, `app/dashboard/settings/SettingsClient.tsx:456`, `lib/relationships/tracker.ts:27,195`, `components/landing/chaos-to-clarity.tsx:254`, `lib/integrations/gmail-client.ts:19`, `lib/integrations/outlook-client.ts:43`, `lib/integrations/outlook-calendar.ts:99`, and `lib/briefing/generator.ts:525`, leaving dead UI and helper surface area around the shipped loop; cleanup. | Codex full audit | OPEN |
| L2 | `scripts/seed-goals.mjs:83-110` samples `tkg_signals.content` without decrypting it first, so any manual goal-seeding run is built from ciphertext fragments and cannot be trusted; cleanup. | Codex full audit | OPEN |
| L3 | `scripts/ci-preflight.mjs:1-11` and `supabase/config.toml:2-8` still reference a stale env/function contract, including a missing `functions/ingest-file` Edge Function, so local ops guidance is misleading; cleanup. | Codex full audit | OPEN |
| L4 | `app/api/onboard/save/route.ts:31-46` validates `tempUserId` but never stores or uses it, so the request contract implies an onboarding-state link that the route does not actually persist; cleanup. | Codex full audit | OPEN |
