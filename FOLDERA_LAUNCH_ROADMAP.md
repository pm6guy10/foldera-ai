# FOLDERA LAUNCH ROADMAP

Last updated: 2026-05-27 PT

## Purpose

This is the repo-backed roadmap for Foldera launch continuity.

For Foldera work, do not rely on chat memory. Repo files and GitHub issues are the source of truth.

## Boot sequence

For any Foldera question or Codex task:

1. Confirm repo: `pm6guy10/foldera-ai`.
2. Read `ACTIVE_HANDOFF.md` first.
3. Read this file.
4. Read the controlling issue named in `ACTIVE_HANDOFF.md`.
5. Read issue #48 for product doctrine.
6. Read any active issue or PR named by `ACTIVE_HANDOFF.md`.
7. Check latest open PRs and the most recent merged PR if repo/deploy state matters.
8. Only then answer, create issues, or code.

Required response shape:

1. Current truth
2. Broken rung
3. Correct move
4. Exact Codex/Figma prompt
5. Forbidden work
6. Proof required
7. Stop condition

## Product doctrine

Issue #48 is the product contract.

Foldera is a Workday Presence Layer / context conduit.

Architecture: state + connectors + triggers + one intervention.

Foldera should remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.

Foldera must not become dashboard triage, inbox summaries, generic task lists, chatbot-first product, surveillance software, or fake enterprise proof.

## Known app context

GitHub:

- Repo: `pm6guy10/foldera-ai`
- Repo ID: `1052282400`
- Default branch: `main`
- Product doctrine issue: #48
- Production E2E issue: #76
- Real Slack decision issue: #77
- Current roadmap issue: #78

Vercel:

- Team: `Brandon's projects`
- Team slug: `brandons-projects-5552f226`
- Team ID: `team_y2RdnSgeVsCExRheya1QRB5z`
- Project: `foldera-ai`
- Project ID: `prj_eG5St3NmUtqYGXJwXsANdZBLYr9N`
- Latest verified production deployment before this roadmap: `dpl_24v9N3K8W8cuuFYfYv1hcH9BKxJM`
- Latest verified production SHA before this roadmap: `48c0cb9ee45d6fcc49fafc82ae9cb97bd633a8f5`

Supabase:

- Project name: `Foldera`
- Project/ref: `neydszeamsflpghtrhue`
- Organization: `nfltyehqarcvcxouclfg`
- Region: `us-west-1`
- Status at continuity lock: `ACTIVE_HEALTHY`
- API URL: `https://neydszeamsflpghtrhue.supabase.co`

## Current truth

- PR #68 merged the free-plan token-value select gate.
- PR #73 made public copy more pilot-honest.
- PR #74 proved the Slack test-mode Right Now interaction loop.
- PR #75 replaced landing mobile section assets and deployed successfully to Vercel production.
- Issue #76 exists because Production E2E #1360 failed after PR #75 and must be classified before production readiness is claimed.
- Issue #77 exists to decide the real Slack integration seam.
- Issue #78 created this roadmap/handoff lock.
- `ACTIVE_HANDOFF.md` must always name the single active implementation seam.

## Ordered launch rungs

### Rung 0 — Continuity lock

Status: active until this file and `ACTIVE_HANDOFF.md` are committed.

Goal:

- lock this roadmap in the repo
- update `ACTIVE_HANDOFF.md`
- name one active implementation seam
- stop relying on chat memory

Forbidden:

- no product feature implementation
- no backend changes
- no frontend redesign
- no Slack OAuth/API/send work
- no Supabase/schema changes
- no Stripe/billing changes
- no broad cleanup

Proof required:

- this file exists
- `ACTIVE_HANDOFF.md` names the active seam
- issue #78 points to the continuity flow

Stop condition:

- repo has one current roadmap, one current handoff, and one named next issue

### Rung 1 — Production E2E truth gate

Status: next active implementation seam.

Control issue: #76.

Goal: classify Production E2E #1360 after PR #75.

Possible outcomes:

1. real landing regression
2. stale test expectation
3. deployment/timing/environment flake
4. unrelated production E2E failure

Forbidden:

- no visual redesign
- no new landing sections
- no Slack/Teams/OAuth/API/send work
- no backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes
- no health env work unless issue #76 proves it is required
- no unrelated cleanup

Proof required:

- exact failing workflow/log/artifact
- exact failing test/file/assertion
- root-cause classification
- narrow PR only if code/test fix is proven necessary
- normal gates if files change

Stop condition:

- Production E2E #1360 is classified with receipt-grade evidence, or a narrow PR is open fixing only the proven cause

### Rung 2 — Real Slack decision

Status: blocked until Rung 1 is classified, unless the user explicitly pauses E2E work.

Control issue: #77.

Goal: decide whether real Slack starts now or after more hardening.

Forbidden:

- no Slack OAuth implementation inside the decision issue
- no real Slack message send inside the decision issue
- no connector expansion
- no fake proof

Proof required:

- repo-backed decision comment
- linked follow-up issue for the approved seam
- exact files, tests, gates, forbidden work, and stop condition

Stop condition:

- issue #77 has one repo-backed decision and one linked follow-up issue

### Rung 3 — Landing production polish

Status: after Rung 1 unless issue #76 proves landing assets/tests need a narrow fix first.

Goal: make the public landing page believable, crisp, pilot-honest, and clickable.

Scope:

- visual quality
- hotspots
- typos/grammar
- warped icons/assets
- responsive framing
- pilot-honest claims

Forbidden:

- no backend
- no auth
- no Supabase
- no Stripe
- no Slack implementation
- no dashboard/product surface changes
- no new product claims

Proof required:

- `npm run lint`
- `npm run build`
- landing Playwright specs
- screenshots at mobile/tablet/desktop
- grep proof for unsupported claims

Stop condition:

- public landing page looks production-polished without claiming unsupported enterprise/Slack/Teams behavior

### Rung 4 — Real Slack MVP, only if approved

Status: blocked by issue #77 decision.

Goal: one safe real Slack loop without expanding the product.

Minimum seam:

- install/auth boundary
- token storage/read boundary
- one Right Now send path
- one interaction update path
- logging/error handling
- tests/gates proving no accidental token exposure

Forbidden:

- no broad connector platform
- no Teams/email implementation
- no dashboard rewrite
- no billing
- no surveillance/screen-reading framing

Proof required:

- one real Slack send path works safely
- interaction updates workday state
- token exposure gates pass
- CI green

Stop condition:

- one real Slack loop works safely and stays inside Workday Presence Layer doctrine

### Rung 5 — Pilot-ready operating loop

Status: after production health, landing honesty, and approved messaging surface proof.

Goal: a human can understand and trust Foldera in one demo without Brandon narrating the whole product.

Required loop:

1. user sets current state
2. Foldera keeps place
3. one Right Now intervention appears
4. user clicks action
5. state updates
6. Foldera stays quiet otherwise

Forbidden:

- no task-list product
- no inbox-summary product
- no fake automations
- no unsupported connector claims

Proof required:

- demo script
- live proof route or screenshots
- CI/npm gates
- pilot-honest copy

Stop condition:

- Foldera is pilot-ready, not necessarily public-enterprise-ready

## Codex context-lock starter

Use this before any task-specific prompt:

```text
Start by reading the repository, not chat.

Repo: pm6guy10/foldera-ai

Required boot sequence:
1. Read ACTIVE_HANDOFF.md.
2. Read FOLDERA_LAUNCH_ROADMAP.md if it exists.
3. Read the controlling issue named in ACTIVE_HANDOFF.md.
4. Read issue #48 for product doctrine.
5. Read any active issue or PR named by ACTIVE_HANDOFF.md.
6. Check latest open PRs and most recent merged PR if repo/deploy state matters.

Do not rely on chat history as source of truth.
If a required doc is missing or stale, repair the handoff/roadmap first.
If the next seam is unclear, stop and write the decision back to GitHub.

Return:
1. Current truth
2. Broken rung
3. Correct move
4. Exact files to inspect/change
5. Forbidden work
6. Proof required
7. Stop condition
```

Optional `@` tags may speed retrieval, but they are not the lock.

## Stop condition for this roadmap

Stop when `ACTIVE_HANDOFF.md` names a single active seam and every new Foldera task starts from this roadmap instead of chat memory.
