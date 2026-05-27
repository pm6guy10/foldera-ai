# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-27 PT
Current `origin/main` SHA at update time: `6ce0932`.

## Boot sequence

For any Foldera question or Codex task:

1. Confirm repo: `pm6guy10/foldera-ai`.
2. Read this file first.
3. Read `FOLDERA_LAUNCH_ROADMAP.md`.
4. Read controlling roadmap issue #78.
5. Read issue #48 for product doctrine.
6. Read active implementation issue #76.
7. Check latest open PRs and most recent merged PR if repo/deploy state matters.
8. Only then answer, create issues, or code.

## Current slice

Continuity lock is now committed.

Current active implementation seam: issue #76 — investigate Production E2E #1360 failure after PR #75.

Real Slack integration remains blocked pending issue #77 decision.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

Issue #48 remains the product contract.

## Current truth

- `FOLDERA_LAUNCH_ROADMAP.md` exists and is the controlling launch roadmap.
- Issue #78 is the current roadmap/continuity lock issue.
- Issue #48 remains the product contract: Workday Presence Layer, not dashboard triage.
- Issue #67 / PR #68 is merged on `main` at `0ef966c5b1e67fbc6f7c3f697bc9bdf2e431bc23`.
- Issue #72 / PR #73 is merged on `main` at `0b21bd329d55135aafeab3ccf9d5c1ae0d541889`.
- Issue #52 / PR #74 is merged on `main` at `9b2e7096cf99a37a9b14d5ccabfd0fb0aacc437b`.
- PR #75 is merged on `main` at `48c0cb9ee45d6fcc49fafc82ae9cb97bd633a8f5`.
- Vercel production deployment for PR #75 is READY: `dpl_24v9N3K8W8cuuFYfYv1hcH9BKxJM`.
- Vercel project: `foldera-ai`, project ID `prj_eG5St3NmUtqYGXJwXsANdZBLYr9N`, team ID `team_y2RdnSgeVsCExRheya1QRB5z`.
- Supabase project: `Foldera`, ref `neydszeamsflpghtrhue`, status at continuity lock `ACTIVE_HEALTHY`.
- Production E2E #1360 failed after PR #75 and must be classified via issue #76 before production readiness is claimed.
- Issue #77 exists to decide real Slack integration ownership, but no real Slack OAuth/API/send work is active yet.

## Enforcement mechanism

- Repo docs and GitHub issues beat chat memory.
- `FOLDERA_LAUNCH_ROADMAP.md` defines launch rungs and app continuity context.
- This file defines the current active seam.
- Issue #76 controls the next implementation investigation.
- Issue #77 controls any future real Slack implementation decision.
- If a rule exists only in chat/comment/markdown and is not enforced by npm gate, CI, test, PR checklist, contract file, or required repo file, treat it as incomplete and propose enforcement.

## Forbidden unless explicitly assigned

- No real Slack OAuth/API/send implementation.
- No landing-page redesign.
- No dashboard UX work.
- No Stripe/billing changes.
- No Supabase/schema changes.
- No scoring/conviction changes.
- No Workday Presence copy changes.
- No broad backend/frontend cleanup.
- No unrelated integration work.

## Next exact move

Run issue #76.

Goal: classify Production E2E #1360 after PR #75.

Required investigation:

1. Fetch Production E2E #1360 logs/artifacts.
2. Identify exact failing test/file/assertion.
3. Compare failure expectation against intended landing behavior after PR #75:
   - six updated assets under `/landing/mobile-sections/01.jpg` through `/06.jpg`
   - CTA/hotspot only on section 1 and section 6
   - no reliance on old `crispcanvas-storyboard` paths
4. Report root cause before editing.
5. If code/test changes are required, open one narrow PR only.

## Exact Codex prompt

```text
Start by reading the repository, not chat.

Repo: pm6guy10/foldera-ai

Read first:
@ACTIVE_HANDOFF.md
@FOLDERA_LAUNCH_ROADMAP.md
Issue #48
Issue #76
Issue #78

Task: investigate Production E2E #1360 after PR #75.

Do not code until the exact failure is known.

Return:
1. Current truth
2. Exact failing workflow/log/artifact
3. Exact failing test/file/assertion
4. Root cause classification:
   - real PR #75 regression
   - stale E2E expectation
   - deployment/timing/environment flake
   - unrelated production E2E failure
5. Correct move
6. Exact files to inspect/change if a fix is required
7. Forbidden work
8. Proof required
9. Stop condition

Forbidden:
- no visual redesign
- no new landing sections
- no Slack/Teams/OAuth/API/send work
- no backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes
- no health env work unless the logs prove it is required
- no unrelated cleanup

Stop when Production E2E #1360 is classified with receipt-grade evidence, or a narrow PR is open fixing only the proven cause.
```

## Proof required

- `FOLDERA_LAUNCH_ROADMAP.md` exists on `main`.
- `ACTIVE_HANDOFF.md` points to issue #76 as active seam.
- Production E2E #1360 is classified before production readiness is claimed.
- No real Slack implementation begins until issue #77 has a repo-backed decision and linked follow-up issue.

## Stop condition

Stop when issue #76 is classified with receipt-grade evidence, or one narrow PR is open fixing only the proven cause.
