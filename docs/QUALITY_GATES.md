# Foldera Quality Gates

Release gates answer: does the path technically work?
Quality gates answer: is the path worth using?

A technically valid artifact is not enough. Foldera passes quality only when the user can understand, trust, and act on the result without Brandon explaining it.

One command answers the current executable quality question:

```bash
npm run gate:quality
```

One command answers the current executable visual-quality question:

```bash
npm run gate:visual
```

The command reports the current release gate result when available, then evaluates the current quality gate from deterministic proof. It must not run paid generation, send email, touch Stripe, change schema, fabricate beta proof, or count owner-only proof as customer proof.

## Core Quality Rule

An artifact exists is not a pass.

A quality pass requires:

- specific source-backed context
- a real reason this matters now
- a concrete next move
- no fake urgency or fake obligation
- no generic coaching
- no summary-only output
- clear source evidence
- safe save, skip, approve behavior

## One-to-One Quality Ladder

Each release gate has a matching quality gate.

### QG_0_LIVE_TRUTH_QUALITY

Pass: repo, deploy, health, and handoff truth are aligned enough to make decisions.
Fail: Codex claims success while production, health, or handoff disagree.

### QG_1_PUBLIC_PRIVATE_BOUNDARY_QUALITY

Pass: public and demo surfaces use fictional professional examples and clearly show the product promise.
Fail: public examples expose or imply owner-private context.

### QG_2_AUTH_ONBOARDING_QUALITY

Pass: new user understands sign-in, source connection, and what happens next.
Fail: user cannot tell whether Foldera is waiting, broken, or ready.

### QG_3_SOURCE_STATUS_QUALITY

Pass: no-provider, stale-provider, no-signal, fresh-signal, and sync-failure states are understandable.
Fail: source status is technically correct but confusing.

### QG_4_SELECTION_QUALITY

Pass: selected move is tied to a real deadline, reply gap, meeting, decision, risk, or document gap.
Fail: Foldera chooses a low-value thing just because it can detect it.

### QG_5_ARTIFACT_OR_CURRENT_MOVE_QUALITY

Pass: the move is specific, timely, source-backed, action-ready, and understandable without narration.
Fail: generic checklist, generic coaching, reminder-only, summary-only, source-free advice, fake pressure, fake obligation, or vague follow-up.

### QG_6_SOURCE_TRAIL_QUALITY

Pass: source trail explains why the move exists and supports the artifact.
Fail: source trail is missing, cryptic, leaky, or does not support the output.

### QG_7_APPROVAL_HISTORY_QUALITY

Pass: save, skip, approve, and history feel safe and understandable. Approval never sends unless explicitly enabled.
Fail: user cannot tell what happened or thinks something was sent when it was only saved.

### QG_8_NON_OWNER_HARNESS_QUALITY

Pass: mocks reveal likely user-path blockers and are clearly labeled mock-only.
Fail: mocks are treated as market proof or real beta readiness.

### QG_9_REAL_NON_OWNER_BETA_QUALITY

Pass: one real non-owner user connects a source, reaches a clear state, understands the result or waiting state, and gives trust/usefulness feedback.
Fail: user needs Brandon to explain the product.

### QG_10_ARTIFACT_QUALITY

Pass: artifact rubric exists, bad examples fail, good examples pass, and low-value artifacts are regression-locked.
Fail: artifact exists but is generic, summary-only, fake, unsupported, or not action-ready.

Executable proof starts with deterministic fixtures. The controller must reject generic prep checklists, coaching, reminder-only output, summary-only output, source-free advice, vague follow-ups, fake urgency, fake obligation, relationship pressure, no-next-move output, inbox/calendar restatement, and artifacts that tell the user what to do instead of delivering finished work. It may pass source-backed decision packets, follow-up drafts, meeting prep with specific source gaps, vendor/customer next-step drafts, stale-document follow-ups, clear no-safe-move explanations, and approval-ready documents.

### QG_11_VISUAL_FRONTEND_QUALITY

Pass: screenshots prove the UI supports the product loop: current move, source trail, and controls are visible and trustworthy.
Fail: Codex claims UI is good without screenshots or mechanical visual proof.

Executable proof must stay gate-only: `npm run gate:visual` may pass from deterministic mock visual proof when QG_10 is passing, current move/source trail/controls are covered, dashboard desktop/mobile screenshots exist with overflow checks, and the proof is labeled mock-only rather than real beta proof.

### QG_12_PRICING_SCALE_QUALITY

Pass: real-user comprehension, artifact quality, and visual trust are proven before asking for money.
Fail: pricing or paid-user push before quality proof.

## Definition of Done for Quality Work

Quality work is done only when:

1. The quality gate is named.
2. Pass and fail examples are explicit.
3. Bad examples fail.
4. Good examples pass.
5. Proof command or browser evidence exists.
6. Production or user-facing risk is named.
7. ACTIVE_HANDOFF.md is updated.
8. SESSION_HISTORY.md is updated.

## Operating Rule

Both release gates and quality gates must pass before Foldera is called beta-ready.
