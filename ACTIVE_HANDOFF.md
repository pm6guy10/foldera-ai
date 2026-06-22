# ACTIVE HANDOFF - FOLDERA

## DON'T FORGET — read first, every boot

1. **Value is the only score.** Foldera exists to produce one act the user wouldn't have done. Green CI, audits, clean code, merged PRs are *hygiene* — not value.
2. **Safe silence beats a fake card.** Never manufacture a verdict; quiet on weak evidence. The Scout obeys this too: no opportunity worth surfacing → stay quiet.
3. **No "done" without live product proof.** Build/tests/CI green is necessary, never sufficient.
4. **Don't make Brandon the router/tester/merger.** Pick the highest-leverage move, do it end-to-end, bring the result + reasoning.
5. **Scout is additive and never auto-sends.** It proposes finished, review-gated artifacts. The Workday Presence Layer stays the always-on default; every `SCOUT_*` flag defaults off.
6. **The Guardian looks inward, not outward.** Watch the user's *own* world (the thread they're about to drop, the reply owed, the deadline in their files) and reduce load. Do **not** fish the open web for external "opportunities" — that is tone-deaf. A fixture/sample card must never be posted to a real channel as if real. See issues #492 / #494 / #481.

Keep this cockpit short and value-first. Completed-issue history lives in `SESSION_HISTORY.md` + git, never here.

## Boot

1. Read this file. 2. Read the active issue (#511). 3. Check issue #136 for recent INTERRUPT receipts.

## Active command gate

`ACTIVE_SEAM_STATE.json` is the machine-readable control plane.

Issue #511 is the active IDENTITY-ARCHITECTURE seam.

Constraint everywhere: NO paid API calls and NO production mutation without explicit owner authorization — prove in the harness.

## Current slice:

**IDENTITY (#511) Stage 3 — Google is the sole sign-in; Microsoft is a connectable surface only.** Removed `AzureADProvider` from NextAuth and the "Continue with Microsoft" button from `/login` + `/start`, so one person maps to one Foldera account and the split-brain can't re-form. Microsoft stays linkable as a *source* via the untouched `/api/microsoft/connect` flow for a signed-in Google user.

**Already done:** Stage 1 link-guard merged (PR #512). The account consolidation was EXECUTED — `e40b7cd8` → `2cbc1bab` (see #509 receipt): the Google-login account now holds all history (5,736 signals / 1,222 actions), both syncing tokens, and the paid Stripe sub.

**Predecessors merged:** #507 (PR #508), LANDING #500 (PR #501), repoint (PR #510), Stage 1 (PR #512).

## Next exact move

1. Land Stage 3 (this PR): drop `AzureADProvider` + the Microsoft sign-in buttons; keep the Microsoft connect-a-source flow; update auth-options test.
2. Proof: `npm run gate:continuity && npm run typecheck && npx vitest run lib/auth/__tests__/auth-options.test.ts app/api/microsoft/callback/__tests__/route.test.ts app/api/google/callback/__tests__/route.test.ts`.
3. Open PR on `claude/identity-stage3-511` targeting #511.
4. Owner: set Vercel `OWNER_USER_ID`/`FOLDERA_SELF_USER_ID` → `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f`. Sign in with Google. Optional next: Scout #494 activation.

Full detail: issue #511.

## Product doctrine

Foldera is a Workday Presence Layer (the always-on default) plus, additively, a flag-gated Proactive Scout lane (Bible Part V). No dashboard / task-manager / inbox-summary / chatbot / surveillance drift; no auto-send. `FOLDERA_MASTER_BIBLE.md` carries doctrine; `AGENTS.md` is the agent contract.

## GitHub writeback contract

- GitHub writeback before stop is mandatory. GitHub source truth beats chat memory; if work isn't written to GitHub, the transaction is incomplete.
- Before stopping, post one terminal receipt: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Update `ACTIVE_HANDOFF.md` when the seam / proof / next move / blocker changes; `FOLDERA_BUILD_ORDER.yaml` when the active issue changes.
