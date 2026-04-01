# REVENUE PROOF — Locked GTM sequence

Repo-grounded revenue model, gates, funnel math, and risks. Update **GATE STATUS** after each production brain-receipt (date + evidence). See `CLAUDE.md` reference documents.

## REVENUE TARGET

- $75K/yr = 216 users at $29/mo
- $40K/yr = 115 users at $29/mo
- 50 users = $17,400/yr (first milestone)

## MONEY LOOP

Connect OAuth → nightly pipeline scores → morning email with one directive + finished artifact → user Approve → external state changes → repeat daily.

Price: $29/mo. Conversion assumption: 3% free-to-paid.

## GATE STATUS (updated 2026-04-01)

| Gate | Current P | Blocker | Fix |
|------|-----------|---------|-----|
| 1. Discovery | 5% | No demo video exists | Record after Gate 4 clears |
| 2. Comprehension | 30% | Homepage doesn't communicate value in 10s | Rewrite after Gate 4 |
| 3. Signup | 20% | Trust signals weak | Free tier, no CC |
| 4. First value | 15% | Zero approved directives. Thinking layer not wired to generator. | Wire scorer analysis to LLM prompt |
| 5. Conversion | 15% | write_document approve does nothing external | Email artifact to user on approve |
| 6. Retention | 50% | Feedback loop exists but untested | Automatic via skip/approve signals |

## FUNNEL MATH

- 216 users at 3% free-to-paid = 7,200 free users needed
- 7,200 at 5% visitor-to-signup = 144,000 visitors
- 50 users (first milestone) = 1,667 free users = 33,340 visitors
- One viral Reddit post (5K–50K views) at 0.1% = 5–50 signups
- Gate 4 must clear before any distribution spend matters

## QUALITY BAR (reference artifact)

A send-worthy artifact names a real person, references their actual thread, answers their specific questions with real terms, handles a calendar conflict in the same message, and closes with a concrete scheduling proposal. The user taps Approve and the outside world changes.

Current output falls short on: cross-source punch (usually one signal type wins), execution identity (sends from brief@foldera.ai not user's address), write_document approve does nothing external, and many runs produce no-send/wait_rationale/do_nothing.

## PRETEND CERTAINTY MAP

Six paths where system sounds confident without evidence:

1. llm_ungrounded_fallback — diagnosis looks identical whether grounded or not
2. Fallback confidence floors — can produce 73 that looks send-worthy but isn't
3. Analyst voice performs conviction thin evidence doesn't support
4. Discrepancy paths have relaxed send gates
5. Emergency fallback presents as real directive
6. First-morning bypass fires at confidence 78 with minimal signal

## SCALING WALL (not today's problem)

- 60s maxDuration cron wall breaks at ~50 users
- Fix: shard into per-user or chunked invocations
- Not relevant until Gate 4 clears

## EXECUTION GAPS

1. send_message sends from brief@foldera.ai not user's identity
2. write_document approve persists to DB, nothing external happens
3. Cross-source candidates exist but rarely win over email-only
4. Convergence extraction requires name overlap in signal body

## INDISPENSABILITY CONDITIONS

1. Send-worthy artifact on most workdays — FAIL
2. Approve changes the outside world — PARTIAL (send_message only)
3. Skipping measurably hurts — NOT PROVEN

## REPLACEABILITY

Smart user CAN replicate obvious outputs in 2 min.

Smart user CANNOT replicate cross-source prioritized outputs (calendar + mail + goals + entity velocity) in 2 min. Product is only defensible when output is non-obvious.

## FIRST FIX (single priority)

Wire scorer/discrepancy analysis to generator prompt so artifacts use the thinking layer that already exists.

Everything else is blocked on this.
