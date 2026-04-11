---
description: 
alwaysApply: true
---

# CLAUDE.md — Active Operator Runbook

## Purpose

This file is the active execution contract for Foldera work.

It exists to keep sessions:
- outcome-focused
- cheap
- verifiable
- autonomous

This file is not an archive, audit log, or historical dumping ground.

Historical notes belong in:
- `SESSION_HISTORY.md`
- `LESSONS_LEARNED.md`
- `AUTOMATION_BACKLOG.md`
- `docs/**`

---

## Read First Every Session

Read these in order:

1. `CURRENT_STATE.md`
2. `AGENTS.md`
3. `LESSONS_LEARNED.md`

Read other files only if they are directly relevant to the active seam.

Do not read the whole repo by default.
Do not broad-audit unless explicitly asked.

---

## Session Start

Before doing anything else:

1. Run `npm run health`
2. Inspect the output
3. If any row shows `FAIL`, treat the first relevant failing row as the top-priority blocker unless the assigned task explicitly targets a different proven seam
4. If health is green or warnings-only, continue autonomously
5. Include the health summary in the final receipt

Health is orientation, not completion.
A green health check does not mean the mission is done.

---

## Core Execution Doctrine

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

### Definitions

**WIN**
A real board change exists.

Examples:
- backend: persisted artifact or proven production-like outcome
- frontend: polished user journey completed end-to-end
- infra: real blocker removed and verified

**EXACT BLOCKER**
One narrow blocker is proven with:
- seam name
- file
- function or route/component
- line or tight range
- proof

**FINAL LIMIT**
No narrow code bug remains.
The remaining issue is clearly:
- product policy
- weak data
- missing product decision
- environment / infra
- paid-model-only proof boundary

Anything else is sludge.

---

## Foldera Product Doctrine

Foldera is not a generic assistant.

Foldera does arithmetic on the user’s life:

1. infer goals, constraints, relationships, and drift
2. detect discrepancy or opportunity
3. score candidate moves
4. output the next highest-leverage finished artifact
5. learn from approve / skip over time

External promise:
**Finished work, every morning**

Working standard:
A smart operator should see the output and think:
**yes, that is exactly the move**

---

## Cost Doctrine

Default rule:
**Most work must be free. Paid runs are for final proof only.**

That means:
- use deterministic tests for basic bugs
- use fixtures and replay harnesses for known failure classes
- use local mocks and offline paths whenever possible
- do not burn paid model calls to discover obvious bugs
- use paid generation only after the seam is already narrowed

If a session is still using paid calls to discover basic breakage, the session is being run wrong.

---

## Git / Shipping Rules

- Push directly to `main`
- Do not create branches unless the task explicitly requires it
- `npm run build` must pass before every commit
- **Always commit and push in the same session** once verified — never leave git work for the user unless blocked (credentials, conflict, or documented impossibility)
- Do not say “done” unless the relevant proof exists
- Commit receipts must be specific and factual

### Required final receipt

Every completed task must report:
- health summary
- what changed
- tests run
- build result
- live/prod-like proof if applicable
- exact remaining unproven items

---

## Verification Rules

### For deterministic or harness-only changes

Local proof is sufficient:
- focused tests
- replay suite
- build

Do not require production verification for purely deterministic internal hardening.

### For live-path or user-facing behavior changes

Require one real proof before calling the work complete:
- production-like execution
- deployed verification
- persisted row
- real route or user-journey proof

A build pass is necessary, not sufficient.

### For shipped code changes

Before calling the task complete, verify deployment state across all relevant layers:

1. local HEAD commit SHA
2. GitHub `main` latest commit SHA
3. Vercel current production deployment SHA and status
4. production `/api/health` revision SHA when that route exists

If these do not match, the task is not complete.

Report the exact mismatch explicitly.

Do not assume:
- local commit means GitHub is current
- GitHub current means Vercel is current
- Vercel Ready means the expected runtime revision is live

### For schema-dependent changes

If a session creates, edits, or depends on a production schema change, applying that migration to production Supabase is the agent’s job.

Do not mark the task done until the migration is:
1. committed
2. applied to production
3. verified

Verification must show the expected production state, for example:
- migration appears in migration history / `list_migrations`
- expected columns / indexes / constraints exist
- dependent code path works against production

Preferred:
- Supabase MCP `apply_migration` for project `neydszeamsflpghtrhue`

Also valid:
- `npx supabase db push` when the repo is linked and credentials are available

Fallback only:
- Supabase SQL editor using the exact committed migration body

If production apply is impossible in-session because of missing credentials, missing tool access, or network failure, state that exact blocker and do not claim the migration task complete.

See `docs/SUPABASE_MIGRATIONS.md`.

---

## Scope Control

Fix the proven seam first.

Broaden from instance to class only when:
- the same failure mode is clearly shared
- the broader fix stays in the same seam
- tests prove the class-level repair

Do not use “fix the class” as permission to refactor half the system.

---

## Architecture Constraints

- Never initialize Supabase or read env vars at top level
- Always resolve env inside functions or safe config boundaries
- `useSession`, `useState`, and `useEffect` require `'use client'`
- Server components use `getServerSession(authOptions)`
- Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Backend uses `SUPABASE_SERVICE_ROLE_KEY`
- Never mix frontend and backend Supabase credentials
- Session-backed routes must use `session.user.id`
- `INGEST_USER_ID` is background and cron only

---

## Locked Decisions

Do not change these without explicit instruction:

- Pricing: Free forever + Pro $29/mo
- Tagline: `Finished work, every morning`
- No trial countdown
- No credit card for free tier
- Nicole Vreeland: never a reference or directive target
- Brandon is never the training mechanism

---

## Foldera-Specific Quality Bar

### Backend / brain work

A valid winner should be:
- grounded in a real thread, obligation, decay, or deadline
- tied to a real external person/org when applicable
- materially useful now
- sendable or directly actionable
- clearly better than a generic memo or reminder

### Frontend / auth work

A valid win should be:
- one real user journey completed end-to-end
- no dead ends
- no raw errors
- no confusing next step
- polished enough to show someone

---

## File Update Rules

Update these only when relevant to the actual seam.

### Always when code meaningfully changes
- `SESSION_HISTORY.md`

### When current live understanding changed
- `CURRENT_STATE.md`

### When a tracked backlog item was closed or newly discovered
- `AUTOMATION_BACKLOG.md`

Do not turn doc updates into the main work.
Docs record the board change. They are not the board change.

---

## Dangerous Areas

Be extra careful in:
- `lib/briefing/**`
- `lib/cron/**`
- `app/api/**`
- `supabase/**`

### Additional rules for `lib/briefing/**`

- do not broaden scoring policy without proof from real candidate traces
- do not reopen closed recipient or gating seams without fresh evidence
- preserve artifact quality bar over superficial “validity”

### Additional rules for `lib/cron/**`

- preserve idempotency
- preserve loop safety
- avoid duplicate-send risk
- prefer single-sourced logic shared by runtime and tests

### Additional rules for `supabase/**`

- no destructive migration without explicit need
- schema changes must be paired with verification
- do not leave migrations unapplied if the session requires them applied

---

## Default Session Pattern

1. Read current state docs
2. Run health
3. Identify one seam
4. Trace the path
5. Add or run focused tests first
6. Patch the seam
7. Re-run focused tests
8. Run build
9. Run one live/prod-like proof if needed
10. Update the small set of docs that actually changed
11. Commit and push
12. Return a hard receipt

---

## What Not To Do

- do not start with a broad repo audit
- do not read huge reference files unless needed
- do not stop at green tests if the mission required live proof
- do not use paid runs to discover basic bugs
- do not claim completion with vague language
- do not ask the user to do work the agent can do directly
- do not leave the session with ambiguous status

---

## Canonical End States

Every session must end in one of these:

### WIN
The board changed and proof exists.

### EXACT BLOCKER
One narrow blocker remains and is fully specified.

### FINAL LIMIT
No narrow code bug remains; the next move requires policy, product, data, or environment change.

Anything else is sludge.
