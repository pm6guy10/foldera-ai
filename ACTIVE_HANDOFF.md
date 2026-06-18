# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-18 UTC (active seam #411 — fix Sources screen raw Azure guest UPN; branch `claude/fix-microsoft-guest-upn-display`)

## Boot

1. Read this file.
2. Read the next active issue (see below).
3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

ACTIVE_SEAM_STATE.json is the machine-readable control plane.
Between rungs — `active_issue: none` is the valid control-plane form; the owner names the next seam. The live product thread is the GUARDIAN (workday-presence): it fires, grounds a real commitment, and pings Slack ONLY when it has a reviewable move — see `FOLDERA_MASTER_BIBLE.md` Part II-B for the full architecture map. The ONE live-readiness blocker is owner-side: the free external 15-min cron for guardian firing cadence (code shipped + harness-proven; it does not fire on schedule until the cron exists).
**LIVE (production `30fbf13`):** #382 frontend overhaul · #390 owner self-review system (`docs/BRANDON.md` + `docs/EXPERT_PANEL.md` + Bible Part IV) · #391/#393 guardian fires-grounded-and-pings · #394/#395 guardian pings only finished work · #397 (PR #398) brief seeds the matched draft at generation time · #399 (PR #400) commitment-title hygiene (no SYNC: key in the card). #382 stays OPEN for optional polish.
**Standing candidates (NOT started, owner to choose):** OWNER-SIDE — configure the external 15-min cron for guardian cadence (the ongoing firing mechanism; NOT a Vercel daily cron). CODE — recolor legacy cyan favicons (`app/favicon.ico`/`public/favicon.png`, BLOCKED on image tooling — `sharp`/imagemagick absent); triage 46 stale remote branches + skipped tests. Constraint: NO paid API calls to test — prove in the harness.

Issue #394 is COMPLETE — guardian pings only finished work: silent/dismissed payload → no Slack (no noise ping); draftless scored_winner recycles the latest matching daily-brief artifact into a reviewable draft (no new LLM, conservative anti-mismatch guard). Merged via PR #395 (`d235cde`); 13 fixtures + 107/107 suite; runtime proof deferred per owner no-paid directive.
Issue #391 is COMPLETE/REVERTED — wired the guardian into the daily morning-pipeline cron (PR #392) then reverted it (PR #393, `7b573eb`) for conflicting with #369 (no daily cron). Runtime proof obtained instead: first grounded `workday_presence_trigger` receipt (`9695a5c6`, ev_count=1) + live Slack ping via a one-time owner-go fire.
Issue #390 is COMPLETE — owner self-review system: `docs/BRANDON.md` (avatar) + `docs/EXPERT_PANEL.md` (9-expert panel) + Bible Part IV ritual; ~29MB dead-image hygiene. Merged `8fd766b`.
Issue #382 is LIVE (OPEN) — whole-app frontend overhaul to `docs/DESIGN_SYSTEM.md` ($500M tier): PRs #383–#388 + #389 pixel-polish (amber brand glyph — cyan killed; one-focal-point hierarchy; de-blurred float; 1240 layout; Slack-forward hero). Optional polish remains.
Issue #378 is COMPLETE — design system locked (PR #379) + full amber landing overhaul; merged via PR #380 (`40b687a`).
Issue #364/#366 is COMPLETE — heartbeat moved off capped GitHub Actions to a free external cron (PRs #365/#366 via #367); owner must create the external cron job for live firing.
Issue #354 is COMPLETE — auth + state-machine integrity (F-auth/F-card/F-dismiss); PRs #357 (`ba42125`) + #358 (`4b2908b`).
Issue #351 is COMPLETE — money-loop integrity sweep (F1-F5); PRs #352 (`b400c5d`) + #353 (`c238165`).
Issue #348 is COMPLETE — presence receipt insert-error hotfix; PR #349 (`9377546`).
Issue #344 is COMPLETE — workday-presence loop closure for non-owner in browser; PR #346 (`e2f7687`).
Issue #341 is COMPLETE — runtime map + current-path Supabase receipts; PR #343 (`613296d`).
Issue #339 is COMPLETE — frontend auth polish closeout; PR #340 (`a315394`).
Issue #276 is COMPLETE — Command State Resolver v0; PR #279 (`e848d01`), closeout PR #280 (`13581bf`).
Issue #262 is COMPLETE — event-driven trigger runner live; PR #273 (`d6b99f2`).
Issue #244 is COMPLETE — Right Now cards / state-change triggers; PRs #308 (`dddece7`) + #313 (`d2bed9a`).
Issue #136 is COMPLETE — Run Ledger rule installed; PR #319 (`d1291ff`).
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.

## Current slice:

Issue #411 is the active product seam.

#411 — the Sources screen renders the Microsoft connected account as a broken raw Azure guest UPN (`b-kapp_outlook.com#EXT#@tenant.onmicrosoft.com`) instead of the real email (`b-kapp@outlook.com`). Owner spotted it live. Both capture paths store `me.mail || me.userPrincipalName`, so a guest/B2B account with empty `mail` lands the mangled UPN. Fix: a pure `normalizeMicrosoftAccountEmail()` in `lib/ui/provider-display.ts` (recovers the real email from an `#EXT#` UPN, case-insensitive; clean emails pass through), applied at the display (`app/dashboard/page.tsx` — repairs the existing row, no DB migration) and at both capture points (`app/api/microsoft/callback/route.ts`, `lib/sync/microsoft-sync.ts`). Deterministic, free, harness-proven.

This session already shipped #402 (review-gated send), #404 (attachment rails), #407 (write_document delivery attachment) — all LIVE on main.

## Next exact move

1. Open the draft PR for `claude/fix-microsoft-guest-upn-display` → #411; get CI green.
2. Proof (free): `lib/ui/__tests__/provider-display.test.ts` 7/7 (guest UPN upper/lower `#EXT#`, clean-email passthrough, empty fallback, no-/multi-underscore edges); existing microsoft callback test green; `tsc` 0 new errors. `gate:continuity` + `lint` + `build` before PR.
3. Live owner validation: open the Sources screen, confirm the Microsoft row reads `b-kapp@outlook.com` — `BLOCKED_WITH_EXACT_RECEIPT` until then.
4. STILL OPEN owner-side (separate from #411): `ALLOW_APPROVAL_EMAIL_SEND` is on — confirm `RESEND_API_KEY` in Vercel Production; connect a real source so a genuine move generates (brain is in safe-silence now, nothing to approve/send); configure the free external 15-min guardian cron. Constraint: NO paid API calls to test — prove in the harness.

Open owner items (not active seams): (1) configure the free external cron for the workday-presence guardian (code shipped; owner creates the cron job for live cadence); (2) landing polish is an open standing goal — each pass obviously better, not incremental.

Current production truth: `Last known main SHA: d235cde`. Whole-app amber + Bricolage type + premium chrome + show-don't-tell landing (#382, OPEN for polish); owner self-review system live (`docs/BRANDON.md` + `docs/EXPERT_PANEL.md` + Bible Part IV); guardian fires-grounded-and-pings-only-finished-work (#391/#393/#394). gitlab-handbook (1.1GB) moved out of the repo tree → `C:/Users/b-kap/foldera-reference/`.

Safety rails unchanged: no outbound sends by default, no paid tests without naming exact cost, acquisition stays quarantined OFF, no fake claims, one intervention max, safe silence is a win, schema changes only via committed+applied+verified migrations.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.
