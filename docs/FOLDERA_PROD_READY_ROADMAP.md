# Foldera Prod-Ready Roadmap

Purpose: define the shortest owner/CTO path from current Foldera state to a production-ready, consistent app. This is not a backlog. This is the release order.

## Current Baseline

As of 2026-05-14:

- GitHub CI and Vercel are green for the current main commit.
- The final-gate rule is active: no done claim unless GitHub CI and Vercel are both green for the exact current main commit.
- Foldera can select the document-collection winner.
- Foldera now refuses fake `.docx` content.
- Foldera can persist a requirements-needed packet.
- The next product risk is not feature count. It is consistency: every winner must become the correct artifact state without stale, fake, or unsupported output.

## Definition of Prod-Ready

Foldera is prod-ready only when it can repeatedly do this:

1. Read connected source truth.
2. Select the right current winner, or explain no safe winner.
3. Classify artifact readiness correctly.
4. Produce finished work when evidence is sufficient.
5. Produce a requirements-needed packet when inputs are missing.
6. Refuse fake work when evidence is weak.
7. Show source trail and decision trace.
8. Preserve save, skip, approve, latest, history, and readback.
9. Keep private owner data out of public/demo surfaces.
10. Finish every change with GitHub CI green and Vercel green for the exact main commit.

## Release Order

### Day 1 — Artifact Readiness Contract

Goal: make the document-collection lesson product-wide.

Codex scope:

- Create/verify an artifact readiness classifier for write_document winners.
- Classify every write_document winner as exactly one of:
  - FINISHED_ARTIFACT_READY
  - REQUIREMENTS_NEEDED
  - NO_SAFE_ARTIFACT
- Ensure latest, detail, history, dashboard, and decision trace agree.
- Prevent stale artifacts from standing in for changed winners.
- Prevent unsupported finished-work claims.

Proof required:

- health
- winner:autopsy
- gate:decision-trace
- focused artifact-readiness tests
- latest/detail/history/dashboard tests if touched
- build
- GitHub CI green for final main commit
- Vercel green for final main commit

Stop condition:

Foldera can truthfully say: for any current write_document winner, I know whether the artifact is finished, requirements-needed, or no-safe-artifact, and all readback surfaces agree.

### Day 2 — Multi-Winner / Next-Best Move Audit

Goal: stop overfitting to a single winner when a small ranked slate may be more valuable.

Codex scope:

- Audit whether the product should show one winner or a short ranked slate.
- Do not build broad task management.
- If implemented, show at most 2-3 moves:
  - primary winner
  - alternate high-confidence move
  - no-safe explanation where relevant
- Each move must have artifact readiness state and source trail.

Proof required:

- deterministic ranked-candidate tests
- no stale artifact reuse
- dashboard/readback proof
- CI/Vercel final gate

Stop condition:

Foldera either proves one winner is correct, or safely shows a small ranked slate without becoming a task manager.

### Day 3 — Production User Path Hardening

Goal: prove the app loop works consistently from login to artifact state.

Codex scope:

- Start/login/onboard/connect/source-status/dashboard path.
- No-token, stale-token, fresh-token/no-signals, fresh-token/winner, requirements-needed, no-safe-artifact states.
- Save/skip/approve/history/latest/detail readback.
- No outbound send unless explicit send flag is enabled.

Proof required:

- Playwright production or production-like proof
- route/API proof
- source trail visible
- decision trace visible
- CI/Vercel final gate

Stop condition:

A user can reach the current artifact state without Brandon narrating the product.

### Day 4 — Artifact Quality Money-Shot

Goal: make one artifact/slate feel worth paying for.

Codex scope:

- Do not polish broad UI.
- Improve the artifact body only after readiness and readback are correct.
- Target one or two artifact families:
  - deadline packet
  - follow-up draft
  - requirements-needed packet
- Output must be finished work or a useful stop packet, not advice.

Proof required:

- bad examples fail
- good examples pass
- real current artifact inspected
- dashboard screenshot/readback proof
- CI/Vercel final gate

Stop condition:

The current artifact/slate is specific, source-backed, action-ready, and understandable without explanation.

### Day 5 — Launch Readiness Cut

Goal: decide whether Foldera is ready for a controlled human use path.

Codex scope:

- Run all gates.
- Verify public/private boundary.
- Verify dashboard path.
- Verify artifact readiness.
- Verify decision trace.
- Verify CI/Vercel final gate.
- Produce a launch-readiness receipt with pass/fail only.

Proof required:

- gate:status
- gate:quality
- gate:visual
- gate:decision-trace
- artifact-readiness proof
- production health SHA
- GitHub CI green
- Vercel green

Stop condition:

Foldera is either:

- PROD-READY CONTROLLED PATH, or
- NOT PROD READY, with the first failing gate named.

## What Not To Do

Do not spend time on:

- broad frontend polish
- pricing/Stripe
- landing copy
- generic backlog cleanup
- more docs without executable proof
- fake users
- owner-only proof as customer proof
- lowering quality bars to force output
- continuing product work while GitHub CI is red

## Owner Rule

Every Codex run must answer:

1. What gate/seam is being fixed?
2. What pass condition existed before editing?
3. What proof passed?
4. Did GitHub CI pass for the exact final main commit?
5. Did Vercel deploy that exact commit?
6. What is the next blocker?

If any answer is missing, the work is not done.
