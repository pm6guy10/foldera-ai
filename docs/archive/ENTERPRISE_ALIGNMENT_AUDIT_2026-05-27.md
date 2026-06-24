# Enterprise Alignment Audit — 2026-05-27

## Verdict

Foldera is no longer a casual vibecode project, but it still does not read like a professional enterprise product team repo.

The main gap is not code volume, staging, or raw CI count.

The main gap is governance split-brain: multiple files claim authority, multiple product doctrines coexist, and CI mostly proves code health instead of enforcing source-of-truth alignment.

## Current truth from repo

### What is strong

- `ACTIVE_HANDOFF.md` now defines the current active seam and points to issue #76.
- `FOLDERA_LAUNCH_ROADMAP.md` exists and defines the launch rungs.
- `CODEX_START.md` has a strong gate-first operator contract.
- `AGENTS.md`, `CLAUDE.md`, `GPT.md`, `SYSTEM_RUNBOOK.md`, `ACCEPTANCE_GATE.md`, `docs/RELEASE_GATES.md`, `docs/QUALITY_GATES.md`, and `docs/FRONTEND_PRODUCT_TRUTH_GATE.md` contain serious execution doctrine.
- `package.json` already has many useful gates: `gate:status`, `gate:quality`, `gate:visual`, `gate:frontend`, `gate:decision-trace`, `health`, CI e2e lanes, production tests, and audit scripts.
- CI is change-aware and has a docs-fast lane.
- Vercel production and `/api/health` expose deployment revision truth.
- Supabase advisors show warnings, but not a current fire.

### What is weak

- There is no `npm run gate:continuity`.
- There is no PR template enforcing issue, proof, source-truth update, next seam, and forbidden-work declaration.
- `.github/workflows/pr-sentinel.yml` is only a heartbeat; it does not enforce PR quality or continuity.
- `README.md` is still the default Next.js README and does not communicate a serious product/repo operating system.
- Several files still disagree on the boot sequence.
- Several files still describe the older command-center/artifact product while newer docs describe Workday Presence Layer.
- `WHATS_NEXT.md` is stale and still says updated 2026-04-10.
- `FOLDERA_PRODUCTION_BACKLOG.md` says no actionable top item, but `ACTIVE_HANDOFF.md` says issue #76 is active and issue #79 now exists.
- `FOLDERA_PRODUCT_SPEC.md` is still titled `BRANDON COMMAND CENTER` and contains old drag-this-file chat workflow language.
- `ACCEPTANCE_GATE.md` still anchors to Brandon/job/interview/benefits/payment artifacts, while the current launch doctrine anchors to Workday Presence Layer and Right Now intervention.
- `FOLDERA_OPERATING_SYSTEM.md` does not list `FOLDERA_LAUNCH_ROADMAP.md` in its canonical operating files.
- `GPT.md`, `CODEX_START.md`, `AGENTS.md`, `CLAUDE.md`, and `FOLDERA_LAUNCH_ROADMAP.md` do not yet share one exact boot sequence.

## Enterprise-quality comparison

A professional product org does not rely on an operator remembering which doc is current.

A mature repo has:

1. One canonical source-of-truth map.
2. One active roadmap / launch sequence.
3. One current handoff.
4. One issue per active seam.
5. One PR per issue.
6. One merge receipt.
7. One release/deploy truth source.
8. Automated checks that make drift visible before merge.

Foldera has many of these pieces, but they are not yet unified into one authority graph.

That is why agents can still do locally rational work that is globally wrong.

## Highest-risk misalignments

### 1. Boot sequence split-brain

`FOLDERA_LAUNCH_ROADMAP.md` says the boot sequence starts with:

1. `ACTIVE_HANDOFF.md`
2. `FOLDERA_LAUNCH_ROADMAP.md`
3. controlling issue
4. issue #48

But older agent docs still direct sessions through:

- `CODEX_START.md`
- `FOLDERA_OPERATING_SYSTEM.md`
- `CURRENT_STATE.md`
- `SYSTEM_RUNBOOK.md`
- `ACCEPTANCE_GATE.md`
- `SESSION_HISTORY.md`

This creates ambiguity for Codex and ChatGPT.

#### Required fix

Create one canonical boot order and update every agent-facing file to reference it verbatim.

Files to align:

- `FOLDERA_OPERATING_SYSTEM.md`
- `CODEX_START.md`
- `AGENTS.md`
- `CLAUDE.md`
- `GPT.md`
- `ACTIVE_HANDOFF.md`
- `FOLDERA_LAUNCH_ROADMAP.md`
- `SYSTEM_RUNBOOK.md`

### 2. Product doctrine split-brain

Current handoff says:

- Workday Presence Layer
- state + connectors + triggers + one intervention
- stay quiet otherwise
- no dashboard triage

But older docs still frame Foldera as:

- Brandon command center
- real inbox/calendar artifact generation
- email-first daily artifact
- job/interview/benefits/payment/admin focus

Those may be historically true, but they are not the current launch story.

#### Required fix

Add doctrine status headers to legacy product docs:

- `CURRENT / CONTROLLING`
- `REFERENCE ONLY`
- `HISTORICAL / SUPERSEDED`

Do not delete history. Mark authority.

### 3. CI gate overload without governance prioritization

Foldera already has many gates. More red checks are not automatically better.

The problem is not insufficient testing. The problem is unclear gate authority.

Some gates prove code health. Some prove product quality. Some prove visual proof. Some are docs receipts. Some are stale. The repo does not yet have a small meta-gate that says whether source-truth alignment is intact.

#### Required fix

Implement `npm run gate:continuity` as a cheap, deterministic source-truth gate.

It should not run Playwright, hit production, or require secrets.

It should check:

- required source-truth files exist
- all agent docs mention the same boot sequence anchor
- `ACTIVE_HANDOFF.md` names exactly one active issue
- `FOLDERA_LAUNCH_ROADMAP.md` exists and is referenced by boot docs
- issue #48/product doctrine is referenced
- `FOLDERA_OPERATING_SYSTEM.md` includes launch roadmap in the canonical map
- stale files are clearly marked historical/reference or updated
- PR template exists

### 4. PR Sentinel is fake enforcement

`.github/workflows/pr-sentinel.yml` currently only echoes that Actions is running.

That is useful as a heartbeat, but it is not a sentinel.

#### Required fix

Keep it cheap, but make it enforce continuity basics:

- run `npm run gate:continuity`
- fail if PR template/source truth requirements are missing
- never run expensive browser tests

### 5. README is amateur-default

`README.md` is still the default Next.js README.

For a public repo, investor, teammate, contractor, or future agent, that reads as unfinished.

#### Required fix

Replace it with a short operator-grade README:

- what Foldera is
- what it is not
- how to boot context
- active source-of-truth files
- how to run gates
- how to open a PR
- what not to touch

### 6. Production E2E design is over-sensitive to docs/runtime SHA drift

Production E2E checks out latest `main`, waits for production health to serve `github.sha`, then runs production smoke.

This is conceptually clean for runtime commits, but docs-only receipt commits and Vercel deployment behavior make the expected-SHA relationship easy to confuse.

#### Required fix

Classify commits as:

- runtime/product
- docs/receipt-only
- CI-only

Production E2E should require exact SHA matching for runtime/product commits. For docs-only receipt commits, it should verify the last runtime/product SHA and record that the latest commit is receipt-only.

### 7. Supabase posture is acceptable for pilot, not enterprise-grade

Current advisors:

- leaked password protection disabled
- insufficient MFA options
- unused index info
- auth DB connection strategy info

This does not block the current launch seam, but it should be ledgered.

#### Required fix

Create a security/posture issue after launch continuity is enforced.

Do not derail current issue #76/#79 work with Supabase tuning unless a real security/blocking requirement appears.

## Correct next move

Do not add more product features yet.

Do not broaden backend/frontend cleanup.

Do not jump to staging unless a live blocker proves staging is the bottleneck.

The next professional move is to implement issue #79:

- one source-of-truth authority graph
- one boot sequence across all agent docs
- PR template
- `npm run gate:continuity`
- PR Sentinel wired to the cheap continuity gate

This is the operating-system fix that reduces context drift for both GPT and Codex.

## Exact Codex prompt

```text
Read ACTIVE_HANDOFF.md, FOLDERA_LAUNCH_ROADMAP.md, issue #48, issue #78, issue #79, and docs/ENTERPRISE_ALIGNMENT_AUDIT_2026-05-27.md.

Task: implement the minimum enterprise continuity governance fix.

Goal:
Make Foldera read like a professionally operated product repo, not a solo vibecode pile with smart but conflicting docs.

Required work:
1. Inspect these files first:
   - ACTIVE_HANDOFF.md
   - FOLDERA_LAUNCH_ROADMAP.md
   - FOLDERA_OPERATING_SYSTEM.md
   - CODEX_START.md
   - AGENTS.md
   - CLAUDE.md
   - GPT.md
   - SYSTEM_RUNBOOK.md
   - ACCEPTANCE_GATE.md
   - docs/RELEASE_GATES.md
   - docs/QUALITY_GATES.md
   - .github/workflows/pr-sentinel.yml
   - package.json
   - README.md
2. Define one canonical boot sequence and update the agent-facing docs to point to it without contradiction.
3. Add `npm run gate:continuity` or equivalent cheap deterministic script.
4. Add or update `.github/pull_request_template.md` with source-truth, issue, proof, forbidden-work, next-seam, and handoff/roadmap checklist items.
5. Wire PR Sentinel to run the continuity gate.
6. Replace the default Next.js README with a short operator-grade Foldera README.
7. Mark stale/legacy doctrine as reference-only where needed; do not delete historical docs.

Forbidden:
- no product feature work
- no Slack OAuth/API/send
- no landing redesign
- no dashboard work
- no backend/auth/Supabase/schema/Stripe changes
- no Playwright expansion
- no broad cleanup
- no deleting historical docs

Proof required:
- npm run gate:continuity passes
- npm run lint passes if touched files require lint
- npm run build only if runtime/app files changed
- PR Sentinel runs the continuity gate
- exact files changed reported
- no product/runtime behavior changed

Stop condition:
Stop when the repo has one enforced source-of-truth boot sequence, one PR template, one cheap continuity gate, and PR Sentinel actually enforces the continuity basics.
```

## Forbidden work

- Do not fix product bugs in this issue.
- Do not redesign the landing page.
- Do not touch Slack implementation.
- Do not touch Supabase schema.
- Do not tune CI broadly.
- Do not build staging unless a specific blocker proves staging is required.
- Do not use expensive tests for continuity governance.

## Proof required

The repo must be able to answer these without Brandon as middleman:

1. What is current?
2. What is blocked?
3. What issue owns the next seam?
4. What changed?
5. What proof ran?
6. What is forbidden?
7. What is next?
8. Did source truth update?

## Stop condition

Foldera reaches this rung when future GPT/Codex sessions can start from the repo and converge on the same next move without Brandon re-explaining context.
