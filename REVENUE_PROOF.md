# REVENUE PROOF — Locked GTM sequence

Repo-grounded revenue model, gates, funnel math, and risks. Update **GATE STATUS** after each production brain-receipt (date + evidence). See `CLAUDE.md` reference documents.

## REVENUE TARGET

- $75K/yr = 216 users at $29/mo
- $40K/yr = 115 users at $29/mo
- 50 users = $17,400/yr (first milestone)

## MONEY LOOP

Connect OAuth → nightly pipeline scores → morning email with one directive + finished artifact → user Approve → external state changes → repeat daily.

Price: $29/mo. Conversion assumption: 3% free-to-paid.

## GATE STATUS (updated 2026-04-02)

| Gate | Current P | Blocker | Fix |
|------|-----------|---------|-----|
| 1. Discovery | 5% | No demo video exists | **Post–Gate 4:** Record a 60–90s screen demo (real approved artifact or honest “nothing today”). Do not spend on ads before Gate 4 evidence. |
| 2. Comprehension | 30% | Homepage doesn't communicate value in 10s | **Post–Gate 4:** One headline + sub that match the money loop (“one email, finished work, approve or skip”). |
| 3. Signup | 20% | Trust signals weak | Free tier, no CC; optional: short “how we access email” blurb linked from `/start`. |
| 4. First value | 15% | Zero approved directives. Artifacts still often obvious vs. user effort. | **2026-04-02:** Generator cross-signal contract deployed (`SYSTEM_PROMPT` artifact quality bar + `low_cross_signal` validation with retry and `wait_rationale` fallback; decision-enforcement repair ordered before cross-signal degradation). **2026-04-02 (ship):** `executeAction` — approved `send_message` uses **Gmail API / Microsoft Graph sendMail** when the user has that integration; **Resend** only as fallback; `execution_result.sent_via` = `gmail` \| `outlook` \| `resend`. **2026-04-02 (ship):** Thread-backed `send_message` skips `low_cross_signal` when `response_pattern_lines` show unreplied threads or discrepancy class `meeting_open_thread` / `document_followup_gap`. **2026-04-02 (ship):** Daily brief email — tier-2 trust copy for `send_message` (paste-yourself + dashboard **Copy draft**); monospace body in artifact panel. **2026-04-02 (ship):** Optional reply threading — artifact may include `gmail_thread_id`, `in_reply_to`, `references`; Gmail/Outlook sends use them when present (generator wiring to populate these is incremental). **Automation evidence:** `npx vitest run lib/conviction/__tests__/execute-action.test.ts` — provider send + threading args. **Brain-receipt pending (operator):** Approve one live `send_message` with connected mailbox; paste `tkg_actions.id` and `execution_result.sent_via` under [Gate 4 live receipt](#gate-4-live-receipt-operator) below. |
| 5. Conversion | 15% | ~~write_document approve does nothing external~~ | **2026-04-02 (ship):** `write_document` approve persists doc + sends **Resend** “document ready” email to verified daily-brief address (`document_ready_email` on execution result). **Still open:** live card checkout + webhook row proof (see [Stripe live test](#stripe-live-test-operator)). |
| 6. Retention | 50% | Feedback loop exists but untested | Automatic via skip/approve signals |

## FUNNEL MATH

- 216 users at 3% free-to-paid = 7,200 free users needed
- 7,200 at 5% visitor-to-signup = 144,000 visitors
- 50 users (first milestone) = 1,667 free users = 33,340 visitors
- One viral Reddit post (5K–50K views) at 0.1% = 5–50 signups
- Gate 4 must clear before any distribution spend matters

## QUALITY BAR (reference artifact)

A send-worthy artifact names a real person, references their actual thread, answers their specific questions with real terms, handles a calendar conflict in the same message, and closes with a concrete scheduling proposal. The user taps Approve and the outside world changes.

Current output falls short on: cross-source punch (usually one signal type wins), execution identity for **`send_message` without mailbox** (Resend fallback still brief@foldera.ai), populating **thread metadata** on artifacts for in-thread replies, and many runs produce no-send/wait_rationale/do_nothing.

**2026-04-02 (code):** Scorer no longer forces decay/reconnect candidates to rank #1 by default (previous `score = 999` block). True ordering is restored unless `SCORER_FORCE_DECAY_WINNER=true` is set for local experiments — reduces misaligned artifacts when a higher-value discrepancy/signal should win.

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

1. send_message — **fixed when Google/Microsoft connected** (`execute-action.ts`); Resend fallback still brief@ for users without mailbox token; **threading** supported when artifact includes `gmail_thread_id` / `in_reply_to` / `references` (populate from pipeline next).
2. write_document — **Resend delivery to user on approve** (`execute-action.ts` + `renderWriteDocumentReadyEmailHtml`); fails closed with `document_ready_email.reason` if no verified email.
3. Cross-source candidates exist but rarely win over email-only
4. Convergence extraction requires name overlap in signal body

## INDISPENSABILITY CONDITIONS

1. Send-worthy artifact on most workdays — FAIL
2. Approve changes the outside world — PARTIAL (send_message from user mailbox when connected; else Resend; write_document → inbox delivery email)
3. Skipping measurably hurts — NOT PROVEN

## REPLACEABILITY

Smart user CAN replicate obvious outputs in 2 min.

Smart user CANNOT replicate cross-source prioritized outputs (calendar + mail + goals + entity velocity) in 2 min. Product is only defensible when output is non-obvious.

## FIRST FIX (single priority)

**Shipped 2026-04-02:** Execution identity for `send_message` (provider first, Resend fallback) + thread-backed `low_cross_signal` exception in `generator.ts`.

**Still open:** Prove Gate 4 on production (approve receipt + `sent_via`); continue tightening artifact specificity and approval rate.

---

## Gate 4 live receipt (operator)

**Sequenced program:** [docs/MEGA_PROMPT_PROGRAM.md](./docs/MEGA_PROMPT_PROGRAM.md) (sessions S1–S9, S4 = this receipt).

**Operator index:** [docs/MASTER_PUNCHLIST.md](./docs/MASTER_PUNCHLIST.md) — dashboard links, how to read `POST /api/settings/run-brief` send `code` if email missing.

1. Confirm deploy green on Vercel; Gmail or Microsoft connected in Settings.
2. Wait for morning brief or run **Generate Now** until a **`send_message`** pending action exists that you would actually send (or use the best available for plumbing proof).
3. Tap **Approve** from email or dashboard.
4. Record here:

| Field | Value |
|-------|--------|
| Date (UTC) | _paste_ |
| `tkg_actions.id` | _paste_ |
| `sent_via` | `gmail` / `outlook` / `resend` |
| Notes | e.g. threading verified / generic body skipped |

Until this row is filled, Gate 4 remains **not revenue-proven** despite automation tests.

---

## Non-owner proof (operator)

1. Sign up with a **non-Brandon** Google account on production (`/start`).
2. Connect the same provider; complete onboarding goals.
3. After nightly-ops + daily-brief (or manual run-brief if available), confirm **email** to that user and a **`tkg_actions` row** with `user_id` = that account (not owner).
4. Acceptance gate `NON_OWNER_DEPTH` should PASS; log date + anonymized user id prefix in `FOLDERA_PRODUCT_SPEC.md` §1.3 if desired.

---

## Stripe live test (operator)

1. In Stripe Dashboard (test or live mode matching env), run one **Checkout** from `/pricing` as a signed-in user.
2. Confirm webhook delivery updates `user_subscriptions` (plan `pro`, status active or trial).
3. Confirm Pro welcome email (Resend) if configured.
4. Record date + mode (test/live) here when done.

---

## GTM post–Gate 4

**Do not** run paid distribution or major homepage rewrites until Gate 4 live receipt is filled.

**Then:** One authentic post (e.g. r/ClaudeAI, r/productivity) with **one screenshot** of a directive you approved + link to foldera.ai; tone: built for myself, connect email, morning finished work — not a feature list.

---

## Sustain Gate 4 (engineering)

- **Validation retries:** structured log `generation_retry` now includes `issue_buckets` + `issue_count` (no full issue strings) to tune prompt vs validator without PII in logs.
- **Query (operator):** `SELECT endpoint, call_type, COUNT(*) FROM api_usage WHERE created_at > now() - interval '7 days' GROUP BY 1,2` — high `directive_retry` share ⇒ first-shot prompt/validation work, not more infra.
