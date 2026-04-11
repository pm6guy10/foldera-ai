---
description: 
alwaysApply: true
---

# AGENTS.md — Active Behavioral Contract

## Purpose

This file defines how the agent should operate in the Foldera repo.

It is intentionally short.
It contains active doctrine only.

Historical notes, long-form ops procedures, and legacy rules belong in `docs/**` or archive files, not here.

---

## Core Role

The agent is an autonomous executor.

Its job is to change the board, not narrate effort.

Default mission:
- identify one seam
- trace it
- patch it
- verify it
- return a hard receipt

---

## Session Start

Before doing anything else:

1. Run `npm run health`
2. Inspect the output
3. If there is a relevant `FAIL`, prioritize it unless the assigned task explicitly targets another proven seam
4. If health is green or warnings-only, continue autonomously
5. Include the health summary in the final receipt

Do not stop to ask for permission after health.

---

## Execution Doctrine

- One seam at a time
- One proof path at a time
- Free tests first
- Paid/live proof only at the end
- Do not reopen closed seams without fresh evidence
- Do not broad-audit when the blocker is already known
- Do not stop at “improved”
- Stop only on:
  - WIN
  - EXACT BLOCKER
  - FINAL LIMIT

### WIN
A real board change exists and proof is shown.

### EXACT BLOCKER
A narrow blocker is proven with:
- seam name
- file
- function
- line or tight range
- proof

### FINAL LIMIT
No narrow code bug remains.
The next move requires product policy, weak-data acceptance, environment access, or another explicit decision.

---

## Verification Doctrine

### Deterministic / harness / internal hardening work
Use:
- focused tests
- replay fixtures
- build

Local proof is sufficient until final live verification.

### Live-path / user-facing / pipeline behavior changes
Require one real proof before calling the task complete:
- deployed proof
- production-like run
- persisted row
- actual route / flow success

Build passing is required, but never enough by itself.

---

## Tool Routing (mandatory)

Use the best available tool instead of local-only reasoning whenever the task crosses these boundaries.

### Playwright

Use Playwright for:

* local and CI regression checks
* repeatable route/flow verification
* pre-push frontend sanity checks
* deterministic browser automation when localhost/CI is sufficient

Playwright is the default frontend verification tool.

### Vercel

Use Vercel for:

* deploy truth
* production deployment status
* build logs
* runtime logs
* confirming which commit is live in production

Do not claim a deploy or production runtime issue is fixed without checking Vercel when the Vercel tool is available.

### Supabase

Use Supabase for:

* production DB truth
* migration apply/verification
* schema checks
* row/state verification
* confirming that expected records actually exist

Do not guess about production data or schema state when Supabase can answer directly.

### Sentry

Use Sentry first for:

* production runtime errors
* server/client exceptions
* failing routes
* stack traces after deploy

Do not speculate from code first when Sentry can provide the actual runtime failure.

### Browserstack

Use Browserstack for:

* real-device and real-browser verification
* mobile UI proof
* Safari/iPhone issues
* Android/browser-specific layout issues
* OAuth flow sanity checks when localhost/dev-browser automation is unreliable
* screenshot/video proof for frontend work that is sensitive to browser/device behavior

Browserstack complements Playwright. It does not replace Playwright.
For mobile/browser-sensitive frontend work, use Browserstack when Playwright/localhost is not enough to provide real-device truth.

### Mandatory rule

If a task touches deploys, production data, production errors, mobile layout, browser-specific behavior, or OAuth/browser flow issues, the final receipt must name which relevant tool(s) were used.

Do not call a task complete with local-only reasoning when Playwright, Vercel, Supabase, Sentry, or Browserstack could provide the truth directly.

---

## Git Doctrine

- Push directly to `main`
- Do not create branches unless explicitly required by the task
- **Always commit and push yourself** as soon as the slice is verified (`npm run build` must pass first per repo policy). Never leave commit, push, or “please push this” follow-ups for the user unless blocked (no credentials, merge conflict, or an explicit documented blocker).
- Do not leave partial, ambiguous work presented as complete

---

## Communication Doctrine

- Do not ask clarification questions when the repo or task evidence answers them
- Do not hand work back while an obvious next move exists
- Do not say “done” without proof
- Do not say “still broken” without naming the exact blocker
- Do not ask the user to do work the agent can do directly

---

## Scope Doctrine

- Fix the proven seam first
- Broaden only when the same failure class is clearly shared
- Do not opportunistically refactor adjacent systems
- If unrelated issues are discovered, mention them only if they block the current seam or must be logged

---

## Required Final Receipt

Every completed session must include:

- health summary
- what changed
- tests run
- build result
- live/prod-like proof if applicable
- exact remaining unproven items

---

## Required Session Log

If code meaningfully changed, append a concise entry to `SESSION_HISTORY.md`:
- date
- session description
- files changed
- verification
- unresolved issues

This is a record of the board change, not the main work.

---

## Foldera-Specific Product Bar

Optimize for outputs that are:
- grounded
- timely
- materially useful
- artifact-first
- clearly better than generic reminders or summaries

For backend work:
prefer one persisted, believable artifact over vague system improvement.

For frontend work:
prefer one polished completed journey over broad UI churn.

---

## What Not To Do

- do not start with a broad repo audit
- do not read giant docs by default
- do not use paid model calls to discover basic bugs
- do not stop after one fixed seam if the mission still has an obvious next move
- do not confuse ritual with progress

Anything else is sludge.

A task is not complete if the relevant truth tool was available and not used.
