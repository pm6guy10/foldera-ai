# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value. "Healthy but not producing value" = still failing. (Bible II-B; `LESSONS_LEARNED.md` #19.)
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Encode the decision; bring the result + reasoning, not the question. (BRANDON.md.)
5. **The ONE value-blocker right now (owner-side):** run a single paid generation cycle and confirm a real gem clears the bar (gem-ranking #456 is live) instead of "nothing cleared the bar." Everything else is secondary to this.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue. 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane. Between rungs, `active_issue: none` is the valid form; the owner names the next seam. Constraint everywhere: NO paid API calls — prove in the harness.

## Current slice:

Issue #445 is the active firm-foundation audit seam.
(Master Audit — anti-rediscovery; one expert pass per PR.)

**Merged to main (through `8654637`):** Pass 0 inventory · Pass 1 RLS `PASS` · Pass 2 database `PASS` (+D-3) · Pass 3 cost `CONCERN` (extraction cap 4→0.25) · **Pass 4 backend/runtime `CONCERN` (#458)** · **Pass 5 AI/ML grounding `PASS`** · F-1 (CI-on-PRs) · gem-ranking floor #456 · lapsing-card hygiene #457 · **overdue-admission window #460 (60d for risk≥60)** · gem-surfacing revert #453 · **LESSONS_LEARNED #19 (value-is-the-only-score) #458.**

**Pass 4 (#458) detail:** fixed B-2 — the `morning-pipeline` orchestrator had no per-stage isolation, so a thrown stage (e.g. nightly sync) silently dropped `daily_brief` (the value stage) for the whole day; `invokeStage` now isolates each stage (fails safe). C-2 root-caused: ~74% of directives pay for a second full LLM call because the first fails validation → routed to **Pass 5 + paid validation**, not shipped blind. Record: `docs/backend/RUNTIME_CORRECTNESS.md`. Verdict CONCERN — runtime is *safe* but still costs without producing value.

**Pass 5 (AI/ML grounding) `PASS`:** read-only forensic pass over the grounding chain (scorer → evidence resolution → worthiness gate → quality gate → send), mapped to the AI/ML kill-questions. All 4 answered affirmative: hard `no_evidence` rejection ("must be grounded in real context"), `fabricated_claim` hard block, scored ranking with freshness *penalizing* recency (magic invariant), 37 grounding/invariant tests green. One soft-by-design observation (O-5.1: `no_source_grounding` is a logged send-receipt warning, not a hard blocker — acceptable because the hard evidence gate already ran). C-2 (first-pass validation quality, ~74% retry) is the AI/ML lever but **needs a paid generation cycle → owner wall**, not shipped blind. Record: `docs/backend/AI_GROUNDING_FAITHFULNESS.md`.

**Passes 6–12 NOT started.** Frontend passes 6 (perf/a11y), 7 (design/UX), 8 (trust/claims) next; or owner runs the C-2 paid-validation lever.

## Next exact move

1. **Owner — the value lever (TRUE wall):** one paid generation cycle to confirm a real gem now surfaces. This is the *only* move that turns "healthy" into "valuable."
2. **Next audit pass: frontend 6 (perf/a11y), 7 (design/UX), or 8 (trust/claims)** — all harness-doable. (Pass 5 done; its C-2 paid-validation lever is the owner item above.)
3. **PR #454 (DRAFT) — broadcast/recruiting-sender suppression** (owner judgment; changes entity admission, can over-suppress at edge cases). On `claude/mvp-polish-pass-audit-sg9e4k`.
4. Deferred follow-ups (harness-only): B-4 budget-reservation reconciliation; B-5 persist retry reasons (Pass 11); the two-way test for relationship gems (coupled to #454). [>30d-overdue admission window shipped via #460.]

Open owner items (not active seams): configure the free external guardian cron (code shipped); landing polish (standing — obviously better each pass, not incremental).

Current production truth: `Last known main SHA: 8654637` (#460 merged — gem-surfacing slices #456/#457/#460 all live). Master Audit #445 passes 0–4 + F-1 merged: RLS/security `PASS`, data-integrity `PASS`, cost `CONCERN`, runtime `CONCERN`. Guardian fires-grounded-and-pings-only-finished-work live (#391/#393/#394); owner self-review system live (`docs/BRANDON.md` + `docs/EXPERT_PANEL.md`).

Safety rails: no outbound sends by default; no paid tests without naming exact cost; acquisition quarantined OFF; no fake claims; one intervention max; safe silence is a win; schema only via committed+applied+verified migrations.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention — remembers where the user was, decides when to interrupt, gives one next move, one click to respond, updates state, stays quiet otherwise. No dashboard / task-manager / inbox-summary / chatbot / surveillance drift. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
