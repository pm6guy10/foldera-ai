# LESSONS LEARNED — LOCKED MARCH 21, 2026

These are permanent. They do not get revisited, softened, or worked around.

## 1. "Done" Without Live Proof Is a Lie

A build pass is not verification. Code pushed is not code proven.

Every CC/Codex session that touches the pipeline must:
- Re-trigger production after deploying
- Query the database for the expected outcome
- Show the receipt (email delivered, action row created, correct status)
- Only THEN report "done"

If a session says "done" without a production receipt, it is not done. Reopen it.

## 2. Fix the Class, Not the Instance

| Wrong | Right |
|---|---|
| Token expired -> refresh it | Token expiring -> auto-refresh 6hrs before cron |
| Commitments exploded -> purge | Commitments growing -> ceiling at 150, auto-suppress |
| Signal stuck -> reprocess | Signal undecryptable -> flag dead_key, never retry |
| Email didn't send -> debug | No valid candidate -> send wait_rationale anyway |
| CC forgot context -> remind it | CC loses context -> one-concern-per-prompt structure |

If you fixed the same problem twice, you fixed the instance. Build the defense that makes the problem impossible.

## 3. The Five Weekly Killers

These five things broke Foldera every single week from March 10-21:

1. **Token expiry** — silent sync failure, no alert, user wakes to nothing
2. **Unverified CC sessions** — "done" without proof, next session discovers wreckage
3. **Mid-session task stacking** — context compacts, half the work lands, bugs multiply
4. **Commitment explosion** — extraction outpaces cleanup, scorer drowns in noise
5. **No second user test** — everything works for Brandon, breaks for everyone else

Each has a permanent defense:
1. Token watchdog in `self-heal.ts`
2. Acceptance gate as final step of every session
3. One-concern mega-prompt template
4. Dedup gate + commitment ceiling in `self-heal.ts`
5. Multi-user check in every prompt + Gate 2

## 4. The Immune System Sequence

Three prompts, three sessions, in order:

1. **Self-heal (defenses)**: token watchdog, commitment ceiling, signal drain, queue hygiene, delivery guarantee, health alert
2. **Self-learn (auto-suppression)**: 3 skips on same entity -> auto-suppress. User approval on suppressed entity -> lift suppression. No manual goal editing.
3. **Self-optimize (dynamic threshold)**: weekly approval rate check. Below 20% -> tighten. Above 60% -> loosen. System finds its own quality bar.

After all three land, Foldera heals itself, learns from behavior, and adjusts its own standards. That is the product promise delivered.

## 5. Monday Morning Sweep

Every Monday before Brandon opens anything:
- Search last week's project chats
- Check Vercel deployment health
- Query Supabase: token expiry dates, commitment counts, signal backlog, action approval rates
- Deliver 5-line status: what's green, what's drifting, what's the one prompt to send

Not a report. Not an audit. Five lines. Brandon approves direction, CC builds, Claude verifies.

## 6. Session Closure Rules

No session ends without answering:
- What was built?
- What was NOT tested?
- What risk carries forward?
- Did the acceptance gate pass against production?

"We're good" is not a valid session close.

## 7. The Product Contract

- The morning email ALWAYS arrives. Silence is a bug.
- Exactly one directive, exactly one finished artifact.
- If the user has to do work after approving, the product is broken.
- A correct "nothing today" is better than a bad directive.
- The system fixes itself or tells you exactly what it can't fix.
- Brandon is never the training mechanism.

## 8. Permanent Success Criteria

The system passes if and only if ALL of these are true every morning with zero human intervention:

1. **DELIVERY**: Email arrives by 7am PT. Every morning. `wait_rationale` counts. Silence fails.
2. **SELF-HEALING**: Tokens, signals, commitments, queue — detected and resolved automatically.
3. **SELF-LEARNING**: Skips and approvals change future output. No manual teaching.
4. **SELF-OPTIMIZING**: Threshold adjusts based on approval rates. System finds its own bar.
5. **MULTI-USER**: Everything works for someone who is not Brandon.

Failure on any criterion = the system is broken. Not "needs improvement." Broken.

## 9. Production E2E Tests Replace Self-Grading

CC cannot test real OAuth flows, session persistence, or redirect chains in its sandbox. The production E2E suite (tests/production/smoke.spec.ts) runs against https://www.foldera.ai with stored session cookies. It catches:
- Middleware redirect loops (the March 23 sign-in bug)
- Session cookie domain mismatches
- API routes returning 401 due to empty userId
- UI copy regressions (pricing, CTAs)
- Dashboard rendering failures

Every deploy must pass this suite. "Build passed" is not verification. "Production E2E passed" is verification.
