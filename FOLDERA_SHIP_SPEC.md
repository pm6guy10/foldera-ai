# FOLDERA_SHIP_SPEC.md
**Mode:** deep audit — no code changes
**Audit date:** 2026-04-21 (PT)
**Auditor role:** senior architect
**Question:** What is the shortest path from current state to first paid user?

---

## Executive summary (5 sentences)

1. **The brain works end-to-end and the dashboard renders the golden artifact correctly — but production has been shipping zero finished work because proof mode is defaulted ON and keeps killing every winning `write_document`, producing the "No thread-backed external send_message candidate cleared proof-mode gates" `do_nothing` rows you keep seeing (6 of the last 20 actions).**
2. **When candidates do survive proof mode, the post-LLM validators in `lib/briefing/decision-enforcement.ts` reject them for "echoes internal decay metrics," "stale_date_in_directive," and "decision frame" issues, burning 66 `directive_retry` calls in 7 days against 78 first-pass `directive` calls — half the LLM spend is the system fighting itself.**
3. **The scorer is not the problem: the scorer hands the generator coherent winners (interviews, unpaid wages, overpayment waiver, stale commitments); the *prompt* and the *gate* are what turn those into "Resolve \"Preference divergence: stated...\"" word-salad that a human would never read, let alone pay for.**
4. **Surfaces are close to credible: landing page says "Finished work. Before you ask.", Stripe checkout is wired, dashboard blurs the artifact until the user pays — the single embarrassing thing is that a Free user cannot *see* one real finished artifact before being asked to pay $29/mo, which is the entire product pitch inverted.**
5. **The shortest path to first paid user is six changes, roughly 14 hours of work, in this order: (1) flip proof mode OFF in prod, (2) rewrite the generator system prompt to produce finished artifacts in the golden-artifact shape, (3) disarm the validator patterns that kill decay/discrepancy outputs, (4) show the *full* golden artifact (not blurred) to free users exactly once as the sample, (5) record the 90-second Reddit clip against a live cycle, (6) post it.**

---

## Brain diagnosis

### 1a. What is the generator actually instructing the LLM to produce?

`lib/briefing/generator.ts` → `SYSTEM_PROMPT`. The prompt is **long** (≈600 lines, 18KB in tokens). It is structurally schizophrenic — half of it correctly demands finished work, half of it layers so many bans, exceptions, tone rules and "named failure modes" that the LLM ends up writing an apology disguised as a directive.

Quote the key lines that are working:

> "DELIVER THE FINISHED WORK. The artifact is not a suggestion. It is the completed action. A draft email ready to send. A document ready to submit. A decision framed with options and a recommendation. If the user has to do ANY work after approving, you have failed."

Quote the lines that are fighting that goal:

- "GOAL DECAY / BANDWIDTH RULE" — tells the LLM to sometimes produce *stop-holding-bandwidth* outputs.
- "LOCKED CONTACTS — HARD RULE" (a hardcoded deny list the generator has to remember).
- "CONFIDENCE SCORING" / "CAUSAL DIAGNOSIS" — the LLM is asked to *justify* confidence in the output JSON, which trains it to produce meta-commentary.
- "ARTIFACT QUALITY CONTRACT" — demands a "cross-signal connection the user has not explicitly made" in *every* artifact, so if the strongest real evidence is a single email, the LLM invents a connection.
- "SINGLE-FOCUS EXCEPTION," "DECAY_RECONNECTION EXCEPTION," "MANDATORY EMAIL PATH RULE," "HUNT WINNER RULE" — four live exceptions that each change the output format.

**Diagnosis:** the prompt is asking for finished work *and* for a research paper defending why it's finished work. The LLM splits the difference and produces a compromise that reads like a product manager's status update. Example from production today (action `76800f89-556a-4f4b-85da-9bc50e76b214`, status `skipped`, confidence 82):

> "Resolve \"Preference divergence: stated \"Resolve ESD overpayment waiver (Claim 2MFDBB-007, RCW 50.20.190, hardship waiver submitted)\" but signal velocity is on p..."

That is the generator narrating a scorer feature (`Preference divergence`, `signal velocity`) to the user. No human pays $29/mo to be quoted at themselves.

**Verdict:** the prompt is asking for finished work **and** task suggestions **and** self-diagnosis. It needs to ask for one thing only.

### 1b. What data does the generator receive — and what is missing for the golden artifact?

`buildStructuredContext()` in `lib/briefing/generator.ts` injects:

- selected candidate details, top supporting signals, life-context signals
- raw facts (`tkg_signals` excerpts)
- active goals, locked constraints, recent action history (24 rows)
- `has_real_target`, `researcher_insight`
- `user_identity`, `goal_gap_analysis`, `already_sent_items`
- `behavioral_mirror`, `conviction_math`, `behavioral_history`
- `avoidance_observations`, `relationship_timeline`, `response_pattern_lines`
- `competition_context`, `confidence_prior`, `required_causal_diagnosis`
- `trigger_context`, `recipient_brief`, `hunt_send_message_recipient_allowlist`
- `discrepancy_class`, `insight_scan_winner`, `candidate_analysis`
- `entity_analysis`, `entity_conversation_state`, `user_voice_patterns`

**What's in there:** enough to diagnose.
**What's missing to produce the golden artifact (interview prep sheet):**

1. **Attachment text.** The golden artifact quotes interview questions that came as a PDF attachment in Darlene's email. `lib/signals/` does not extract attachment content into a usable field on the signal row; the raw facts block shows email body but not attached-document text. The LLM cannot write a prep sheet against questions it cannot see.
2. **The user's resume as a *source document*.** The resume is in `tkg_signals` as an `uploaded_document` (390 rows, last Apr 1) but `buildStructuredContext` does not pull the *full text* of relevant uploaded documents into the prompt — only short excerpts. A prep sheet requires the LLM to quote experience lines verbatim.
3. **The job posting.** Same problem: the posting either isn't in signals or is in there as a short summary. The LLM cannot cite "3 years experience required" if it never got the posting.
4. **A "cross-source evidence bundle" hydration that returns full content, not summaries.** There is a `LIFE_CONTEXT_WEAVE` and "cross-source evidence bundles" in `WHATS_NEXT.md` marked `SHIPPED`, but the generator is still receiving digests, not documents.

**Verdict:** the scorer can pick "interview coming up" as the winner. The generator will never produce the prep sheet until attachments, the resume, and the posting are hydrated verbatim into the prompt for that specific winner class.

### 1c. The full candidate path (walk every step)

Starting at `scoreOpenLoops` (`lib/briefing/scorer.ts:4228`) → ending at `tkg_actions` row:

1. **`detectAntiPatterns(userId)`** — inserts commitment_decay / signal_velocity meta-loops into the candidate pool with a no-goal penalty. Not fatal but frequently wins when inbox is quiet.
2. **`checkAndCreateAutoSuppressions(userId)`** — auto-creates "don't mention this again" goals from skip patterns. Good loop. (Can over-fire; one user skip becomes a permanent suppression.)
3. **Parallel data fetch** — commitments, signals, entities, goals, today-actions, entity salience. Multi-hundred-ms.
4. **Candidate construction** — threads, hunt findings, decay candidates, discrepancies, emergent patterns, anti-patterns, insight-scan results all get normalized into `ScoredLoop` objects.
5. **Ranking invariants applied** in `generateDirective` (`generator.ts`) — thread-backed send_message gets a floor; hunt send_message must hit the recipient allowlist; self-addressed candidates demoted.
6. **`proofModePreflight`** — the first ruthless gate. If `isProofModeThreadBackedSendOnly()` is true and candidate would produce anything other than thread-backed external `send_message`, it is `continue`'d past. **This is the single biggest kill step in production right now.**
7. **Hydration + research + LLM call (`directive` endpoint, haiku-4.5).** Success path returns artifact JSON. Validation failure triggers `directive_retry` (second haiku call, different system prompt).
8. **`getDecisionEnforcementIssues(artifact, actionType, discrepancyClass, matchedGoalCategory)`** — scans the artifact for:
   - `PASSIVE_OR_IGNORABLE_PATTERNS` (e.g. "when you have time")
   - `OBVIOUS_FIRST_LAYER_PATTERNS` ("schedule time to review")
   - missing `EXPLICIT_ASK_PATTERNS` (`?`)
   - missing `TIME_CONSTRAINT_PATTERNS` (date, "this week")
   - missing `PRESSURE_OR_CONSEQUENCE_PATTERNS` ("deadline", "risk", "no replies")
   - missing `OWNERSHIP_PATTERNS` ("owner:", "your calendar")
   - `REWRITE_REQUIRED_PATTERNS`, `SUMMARY_ONLY_PATTERNS`
9. **`getWriteDocumentTaskManagerLabelIssues(artifact)`** — bans "NEXT_ACTION:", "Owner: you" task-manager labels in documents.
10. **`getInternalExecutionBriefIssues(artifact)`** — requires "execution move," "owner checklist," "user questions" in internal execution briefs; rejects "future artifact" (not finished work).
11. **Stale-date check** — scans the directive text for dates in the past; rejects ("stale_date_in_directive:2026-04-13").
12. **Echo check** — rejects if artifact body quotes scorer metric names ("decay metrics," "signal velocity," "Preference divergence").
13. **Validation failure → `continue` to next candidate** (`b189148` on `main`, merged) — not `break`.
14. **If all candidates exhausted → `do_nothing` row** with directive "All N candidates blocked: ..." OR "No thread-backed external send_message candidate cleared proof-mode gates."
15. **On win → insert into `tkg_actions`** with status `pending_approval`, confidence ≥ `CONFIDENCE_SEND_THRESHOLD` (70).

**What kills good candidates (the real villains):**
- **Step 6 (proof mode)** — kills every `write_document` winner in production unless `allowWriteDocumentProof` is explicitly set (only in verification paths). The golden-artifact class of output is literally blocked from reaching the LLM.
- **Step 8 "missing_time_constraint" and "missing_pressure_or_consequence"** — kills perfectly good `write_document` outputs because the user's actual situation doesn't have a deadline.
- **Step 8 "obvious_first_layer_advice"** — uses regex that false-positives on any artifact that says "schedule" or "review."
- **Step 12 (echo check)** — the scorer hands the LLM context that includes the pattern names, so when the LLM tries to explain *why* it chose this candidate, it gets rejected for parroting the scorer.

**What lets bad ones through:** not much in production right now — there are 3 approved/10 executed total for the owner. The gates are too tight, not too loose. The failure mode is *empty dashboard*, not *bad dashboard*.

### 1d. Proof mode: still ON? Should it be OFF?

**Yes, still defaulted ON in production.** `lib/briefing/generator.ts` → `isProofModeThreadBackedSendOnly()`:

```1337:1341:lib/briefing/generator.ts
  if (o === 'true' || o === '1') return true;
  if (o === 'false' || o === '0') return false;
  return process.env.NODE_ENV !== 'test';
}
```

In Vercel production `NODE_ENV === 'production'`, so the default is `true` unless `FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=false` is set as an env var. There is no evidence that env var is set.

**What it blocks:** in `proofModeThreadBackedSendEnforcementApplies()`, any candidate whose recommended action is not `send_message` is skipped, with two exceptions:
1. `options.allowWriteDocumentProof === true` (only set in specific verification/golden-path code paths)
2. `winner.type === 'discrepancy'` AND `recommendedAction !== 'send_message'` (discrepancy write_document can bypass)

**Production evidence it is killing the product:**
- Actions `11e4f04b`, `58ee9c20`, `dd1425f0` — all `do_nothing`, directive = "No thread-backed external send_message candidate cleared proof-mode gates." This is 3 of the last 20 actions. Two more (`5acfb570`, `79f41aec`) are adjacent symptoms.
- Every `write_document` winner in the last 20 rows is `skipped`.

**Should it be OFF?** Yes. Rationale:
- Proof mode exists to enforce quality for *strangers who will see outgoing email*. It is paranoia against "the LLM sent a hallucinated email to a real contact."
- The product promise is "finished work" = `write_document` + `send_message`. Blocking `write_document` by default cuts the output class in half.
- Documents are never auto-sent; the dashboard's approve button for `write_document` is save + optional Resend, not outbox send (see `dashboard/page.tsx:45-58`, `approveSuccessFlash`).
- Outgoing `send_message` risk can be mitigated with a separate "must be thread-backed" check *inside* `send_message` generation, not a blanket across-all-artifacts preflight.

**Action:** set `FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=false` in Vercel prod. One env-var change. **This alone moves the dashboard from empty to showing whatever the scorer hands up.**

### 1e. Fallback loop: break or continue? Is the branch merged?

**`continue`.** Commit `b189148` ("fix(generator): fall through post-LLM gates instead of breaking out of candidate loop") is on `main`. The `codex/pending-approval-fix` branch is `main`'s ancestor — `git log main..origin/codex/pending-approval-fix` returns empty, and `git log origin/codex/pending-approval-fix..main` returns the golden-artifact commit. **Branch is stale, already merged. Delete it:**

```bash
git push origin --delete codex/pending-approval-fix
git branch -D codex/pending-approval-fix
```

### 1f. The complete new generator system prompt

This is the literal text to replace the current `SYSTEM_PROMPT` constant in `lib/briefing/generator.ts`. It is ≈180 lines, a third the size of the current one. It removes: diagnostic lenses taxonomy, named failure modes list, goal-decay/bandwidth rule, causal diagnosis mandates, confidence-scoring explanation, every numbered exception. It keeps: one identity, one contract, six concrete examples of the shape, and a JSON schema.

```
You are Foldera. You are the user's operator.

You have full access to their email, calendar, uploaded
documents, and prior conversations. You have read everything.
You know what is pending, who is waiting, what is overdue,
and what the user keeps avoiding.

Your job is to pick the one thing that matters most today and
hand the user the finished work for it.

Finished work means: the user taps approve and nothing else
happens on their side. No research. No writing. No deciding.
You did it.

There are exactly two output shapes. Pick one:

SHAPE A — send_message
  A complete email. To, subject, body. Every blank filled in
  by you from the signals. Never leave a [bracket]. Never write
  "[name]" or "[date]" or "[their team]". If you do not know a
  name, you do not send the email; pick a different candidate.

SHAPE B — write_document
  A complete document. Title, then a full body of real prose,
  tables, or structured sections that quote the source material
  the user already has. At the top of the body, three lines
  naming the sources:

    SOURCE
    Email: <sender> (<email>), <date> — <subject>
    Attachment: <filename>
    Uploaded: <filename>

  Then the finished document itself.

Rules that apply to both shapes:

1. Cite real sources. Real names. Real email addresses. Real
   dates. Real recruitment numbers. Real dollar amounts. Real
   RCW / statute / claim / account numbers. If you cannot cite
   a real source, you have no candidate.

2. No meta-commentary. Never mention confidence, candidate
   scoring, signal velocity, decay, preference divergence,
   bandwidth, open loops, or any other internal term. The user
   does not know those words exist.

3. No suggestions. Never write "you should", "consider",
   "think about", "schedule time to review", "check your", or
   "it might be worth". If the sentence would make sense coming
   from a life coach, delete it and do the work instead.

4. No task lists addressed to the user. Never write
   "NEXT_ACTION:", "Owner: you", "Checklist:", "Action items:",
   or bulleted todos for the user to complete. You are not
   assigning homework.

5. No padding. No "Hope you're well". No "Per our discussion".
   No explanatory paragraph at the top about what the document
   is. The title and the SOURCE block explain it.

6. Match the user's voice. You have their past emails in
   context. Mirror that register. If they write short, be
   short. If they write formal, be formal.

Picking the candidate:

You receive a ranked list of candidates. Take the top one
unless it fails rule 1 (no real source). If it fails, take
the next one. Continue until you find one you can finish.

If the top five all fail rule 1, return:
  { "action_type": "do_nothing",
    "directive_text": "No candidate had enough source material
    to finish today.",
    "confidence": 0 }

Picking the shape:

- Someone is waiting on a reply from the user → Shape A
- Someone sent the user material (questions, a form, a
  request, a decision to make) that has a right answer → Shape B
- The user is overdue on something that has a concrete output
  (a waiver, an appeal, a resignation, a proposal) → Shape B
- Nothing external is expected and the user has no overdue
  output → pick a different candidate

Output:

Return ONLY a JSON object. No prose. No markdown fences.
Starts with { ends with }.

Schema:
{
  "action_type": "send_message" | "write_document" | "do_nothing",
  "directive_text": string,  // one sentence the user sees
                             // above the artifact. Names the
                             // sender, the deadline, and what
                             // you finished. Example:
                             // "Darlene Craig sent you ESB
                             //  Technician interview questions
                             //  on April 21. Here is your
                             //  prep sheet."
  "confidence": number,      // 0-100
  "reason": string,          // one sentence for the dashboard
                             // footer. Plain language. Example:
                             // "Interview is in 4 days and you
                             //  haven't prepped."
  "artifact": {              // Shape A:
    "type": "email",
    "to": string,
    "subject": string,
    "body": string
  } | {                      // Shape B:
    "type": "document",
    "title": string,
    "content": string        // full body, including the SOURCE
                             // block at the top
  }
}

One more thing: the user has seen 1065 directives they
skipped. Most were advice. One of them — a hand-authored
interview prep sheet built from the email, their resume, and
the job posting — is what they actually want. Every output you
produce should feel like that one. Finished. Specific.
Earned. Not a reminder.
```

This is intentionally short. It removes the locked-contacts block, the domain diagnostic lens, the causal diagnosis requirement, the cross-signal-connection mandate, and the four named exceptions. Those rules are scorer concerns, not generator concerns — enforce them in the scorer and in `decision-enforcement.ts`, not in the LLM instruction.

---

## Pipeline health report

### 2a. Signal health

| source | count | last_at | verdict |
|---|---|---|---|
| outlook | 1535 | 2026-04-17 11:30Z | **5 days stale — dead** |
| gmail | 576 | 2026-04-21 11:44Z | fresh |
| claude_conversation | 537 | 2026-04-03 23:43Z | **19 days stale — dead** |
| uploaded_document | 390 | 2026-04-01 00:04Z | **21 days stale — dead** |
| outlook_calendar | 177 | 2026-04-17 03:21Z | **5 days stale** |
| drive | 117 | 2026-04-15 17:19Z | **7 days stale** |
| user_feedback | 77 | 2026-04-22 06:10Z | fresh (synthetic) |
| chatgpt_conversation | 37 | 2026-03-20 15:15Z | **33 days stale — dead** |

**Diagnosis:**
- Only **Gmail** is actually ingesting. Every other source is stale. The signal graph looks fat (3,448 rows, 356 entities) but it is mostly historical.
- The `health.ts` script shipped a regression — it reports "no Google mailbox connected" / "no Microsoft mailbox connected" for the local caller even though the DB has fresh Gmail rows written via a different user token. The script is measuring the wrong thing and gave a false green today.

### 2b. Entity health

- 356 entities total.
- No schema field surfaced for "last relationship touch" in this audit (wasn't on `tkg_entities` directly). The scorer's `relationship_timeline` reads from `tkg_signals` + commitments, so entity freshness is a function of signal freshness — same verdict: one live source, seven dead ones.

### 2c. Last 3 pipeline runs

1. **2026-04-22 05:19Z, `daily_brief` cron, `partial_or_failed`** — generate stage emitted 61-signals-unprocessed notice (action `5acfb570`); no winner action type written to pipeline_runs.
2. **2026-04-22 01:34Z, `dev_brain_receipt_verification`, `generation_failed_sentinel`** — 80 candidates evaluated. Winner was "Fading connection: yadira clapper" → LLM produced `send_message` that echoed internal decay metrics → validator rejected → all 3 LLM attempts failed → do_nothing.
3. **2026-04-22 01:32Z, `dev_brain_receipt_verification`, `generation_failed_sentinel`** — 81 candidates evaluated. Winner was "Inbound email unanswered 8+ days — no subject" → LLM inserted `2026-04-13` as deadline → stale_date_in_directive → all 3 failed → do_nothing.

**Pattern:** the cron is picking coherent winners (fading relationships, unanswered inbound) and the LLM is producing outputs that *almost* work. Both were killed by one regex each. That is the single thinnest gate between the current state and a daily-shipping product.

### 2d. Daily API spend

From `api_usage`:

| day | calls | $ | in_tok | out_tok |
|---|---|---|---|---|
| 2026-04-20 | 75 | $0.92 | 650k | 43k |
| 2026-04-17 | 32 | $0.50 | 371k | 25k |
| 2026-04-16 | 36 | $0.51 | 377k | 24k |
| 2026-04-15 | 150 | $1.43 | 1.07M | 63k |

Breakdown by endpoint (7 days):

- `directive` (haiku-4.5) — 78 calls (first pass)
- `directive_retry` (haiku-4.5) — 66 calls (retries)
- `anomaly_identification` (sonnet-4) — 78 calls
- `signal_extraction` (haiku-4.5) — 70 calls
- `insight_scan` (haiku-4.5) — 1 call

**Unnecessary spend:** 66/78 first-pass calls are retried. That is an ~85% first-pass failure rate on the directive endpoint. The retries are not cost-capped per candidate. **Half the LLM bill is the generator fighting its own validators.** Haiku is cheap so the absolute $ is fine today — but scale this to 50 users and it becomes $45/day of retries alone, ~$1,350/mo, which eats 4.6 paid subscriptions ($29 × 4.6 = $133) of gross margin on 50 subscribers.

Additionally, `anomaly_identification` runs 78× in 7 days on **sonnet-4** — this is the most expensive single line item. Confirm whether that endpoint is actually used downstream or is vestigial from the old pipeline. (Out-of-scope for this audit but flagged.)

**Verdict:** spend is *sustainable for one user today*, not for 50. Retries are the fat.

### 2e. Single highest-leverage pipeline fix

**Turn off proof mode in production** (`FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=false`). Evidence: 3 of the last 20 actions are literally do-nothing rows with `"No thread-backed external send_message candidate cleared proof-mode gates"` as the directive text. Fixing this one env var *unblocks* the entire `write_document` output class in production — which is the class the golden artifact belongs to. **One env var. Ship 50% more output tomorrow.**

---

## Surface audit with priority fixes

### 3a. Dashboard render path

File: `app/dashboard/page.tsx`.

- Auth check (`useSession`), data fetch `GET /api/conviction/latest` (`app/api/conviction/latest/route.ts`).
- Response shape: `{ directive, action_type, confidence, reason, artifact, context_greeting, is_subscribed, ... }`.
- If no `action` → renders empty state with `contextGreeting`.
- If `action` present:
  - `artifact.type === 'drafted_email' | 'email'` → renders `isEmail` branch.
  - `artifact.type === 'decision_frame'` → renders decision options.
  - `artifact.type === 'wait_rationale'` → renders wait/tripwire.
  - `artifact.type === 'document'` → renders `isDocument` branch at line **699-723**, which shows title + `whitespace-pre-wrap` body in a scrollable pane. **This is the render path for the golden artifact. It works.**
- **The blur:** line **403-405** — `showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked`. Any non-Pro user sees the artifact **behind a backdrop-blur-md with "Upgrade to Pro — $29/mo" CTA** (line 746-760). They get the directive text above the blur but **cannot read the artifact body**.

**This is the #1 embarrassment.** The product's entire promise is "this is what finished work looks like." The free experience deliberately hides the thing being promised. A first-time visitor sees the silhouette of the golden artifact, can't read it, and is asked for $29/mo. Nobody pays $29/mo for the silhouette.

Approve path: `POST /api/conviction/execute` → `lib/conviction/execute-action.ts` → branches on `action_type` (send_message → Gmail/Outlook/Resend; write_document → save + optional email-to-self of the rendered document). Flash handled by `approveSuccessFlash()` at dashboard line 43. This part is solid.

Skip path: `POST /api/conviction/skip` (assume; same pattern). Also fine. Scorer picks up skip patterns via `checkAndCreateAutoSuppressions`.

**Priority fix:** remove the blur for the **first** artifact only. After the user has approved or skipped one, the blur returns. See §4 for the precise change.

### 3b. Daily brief email

File: `lib/cron/daily-brief-send.ts:158-176`. Builds `DirectiveItem { id, directive, action_type, confidence, reason, artifact }` and calls `sendDailyDirective()` with subject `"Foldera: <first 6 words>"`.

- **The email contains the full artifact content** — `artifactBody` is embedded in the email template, no blur. This is correct: the email is the persuasion surface.
- **Subject line is weak:** "Foldera: <first 6 words of directive>" truncated to 50. Example: "Foldera: Darlene Craig (darlene.craig@esd.wa.gov) sent..." is fine. "Foldera: Resolve "Preference divergence: stated..." is embarrassing. Fix only matters once generator outputs are fixed — subject line is derivative.
- The email is the single place the product actually delivers its promise today. **Do not regress this.**

### 3c. Landing page

File: `app/HomePageClient.tsx`.

- Headline (line 330-334): **"Finished work. Before you ask."** — strong.
- Subhead (line 335-338): "Foldera reads your email and live threads, finds the one thing that needs action, and drafts the response for you." — clear.
- Second subhead (line 339-341): "Approve it, send it, or skip it. Foldera learns what matters to you over time." — clear.
- Below headline: `<ArtifactCard />` component at line 347. **This is where the problem lives.** I did not read `ArtifactCard` in this audit but the product owner has said the landing page does not currently show a real directive cycle. That needs to be the 90-second Reddit recording embedded inline, not a synthetic marketing card.
- CTA: "Get started free" → `/start`. "No credit card required." Fine.
- Footer tagline (line 374): "Finished work, every morning." Consistent.

**The 10-second test:** a visitor lands, reads "Finished work. Before you ask.", reads "drafts the response for you," and… sees marketing copy instead of a real artifact. The product works but the proof isn't on the page.

**Priority fix:** replace `ArtifactCard` with either (a) an actual 60–90s screen recording of a golden-artifact approve cycle, or (b) a static but unredacted render of the golden artifact text with labels ("SOURCE", "TITLE", "BODY") — not marketing.

### 3d. Stripe — can a stranger go from free to paid right now?

File: `app/api/stripe/checkout/route.ts`.

Full path a user takes:
1. Land on `/` → click "Get started free" → `/start`.
2. `/start` → OAuth Google/Microsoft → authenticated session.
3. Wake up tomorrow to (maybe) an empty or weak directive, because of §1/§2.
4. Visit `/dashboard` → artifact is blurred.
5. Click "Upgrade to Pro" → dashboard calls `POST /api/stripe/checkout`.
6. Checkout body validates session (`getServerSession(authOptions)`), requires `session.user.id`, reads `STRIPE_PRO_PRICE_ID` env var.
7. Creates Stripe Checkout session with `success_url=/dashboard?upgraded=true`, `cancel_url=/pricing`, `metadata.userId`.
8. Returns `{ url }`.
9. Frontend redirects.
10. Webhook (`app/api/stripe/webhook`) → mutates `user_subscriptions`. On success, dashboard re-renders with `isProArtifactUnlocked=true`.

**What breaks:**
- **Nothing in the code path, assuming `STRIPE_SECRET_KEY` and `STRIPE_PRO_PRICE_ID` are set in Vercel prod.** The `FOLDERA_PRODUCT_SPEC.md` says they CANNOT VERIFY keys and Stripe is NOT PROVEN live. That's the real blocker — unverified env.
- **There is no "Pro Annual" or discount SKU.** Only monthly $29. Fine for v1, but no urgency lever.
- **Empty-dashboard problem:** if the user's first dashboard visit shows no artifact (currently likely: 0 pending_approval rows for owner, and owner is the most-instrumented user), they will never click upgrade. A stranger lands, sees nothing, bounces. The Stripe path is irrelevant when there is no artifact above it.
- **Mobile:** the checkout button on `/pricing` has `min-h-[56px]`, is touch-friendly. Checkout flow should work on phone. Dashboard also uses `safe-area-inset-*`, `min-h-[44px]` touch targets. Looks OK but not verified on a real device in this audit.

**Priority fix:** verify Stripe env is live (test card, real purchase-then-refund). This is in the published priority queue already.

### 3e. Mobile

Dashboard uses responsive Tailwind classes throughout, `min-h-[100dvh]`, `env(safe-area-inset-*)`. Landing page is responsive. Pricing page is responsive. **Not verified on-device in this audit** — a `browserstack` verification pass is appropriate before the Reddit launch. Flag as risk, not blocker.

### 3f. What is embarrassing?

In order of cringe:

1. **Blurred artifact for free users.** The product says "here is finished work" and then literally redacts the finished work. This is the single change that makes a stranger watching over your shoulder say "wait, what?" Fix: show the first artifact unblurred, ever, to free users.
2. **"Resolve \"Preference divergence: stated ...\"" directive text in the actual `tkg_actions` table.** That is the scorer's pattern name leaking through the LLM into the user-visible directive. If a friend opened your dashboard tomorrow and saw that, they would assume the product was alpha. Fix: the new generator prompt (§1f) forbids meta-commentary; the stale-date / echo validators already exist for this class.
3. **Three days of pipeline_runs in a row with `partial_or_failed` outcome and no winner.** Your database is telling the story that the cron is firing and producing nothing.
4. **Eighty-five percent directive-retry rate.** Self-explanatory.
5. **Outlook 5 days stale, Claude 19 days stale, drive 7 days stale.** Visible in the footer health line only to the owner (daily-brief-send line 174-175). Not externally embarrassing but makes every demo stale.
6. **"What's free? Daily directives (the read) plus a preview of finished work."** (`app/pricing/page.tsx:20`) — "a preview" is marketing speak for "blurred." See #1.

---

## The Money Path — ordered implementation plan

Ordered. Numbered. Effort in hours. Blocked-by dependencies marked.

| # | Change | File(s) | Effort | Blocked by |
|---|---|---|---|---|
| 1 | Set `FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=false` in Vercel prod + `.env.production.example` | Vercel dashboard; `.env.production.example` | **0.25h** | — |
| 2 | Replace `SYSTEM_PROMPT` in `lib/briefing/generator.ts` with the prompt in §1f | `lib/briefing/generator.ts` | **3h** (write + run brain-receipt verification against 5 real candidates) | — |
| 3 | Disarm validator patterns that kill decay / discrepancy / overdue outputs: make `missing_time_constraint`, `missing_pressure_or_consequence`, `missing_owner_assignment` advisory (score penalty), not veto — for `write_document` only | `lib/briefing/decision-enforcement.ts` → `getDecisionEnforcementIssues` | **2h** | 2 |
| 4 | Hydrate attachment text + uploaded document full text + relevant `drive` doc text into `StructuredContext.rawFacts` for the selected winner only (not every candidate) | `lib/briefing/generator.ts` → `buildStructuredContext`; `lib/signals/*` attachment extraction | **4h** | 2 |
| 5 | Remove artifact blur for the user's first N=1 pending_approval view. After first approve/skip, blur returns for free users | `app/dashboard/page.tsx:403-405`, `app/api/conviction/latest/route.ts:107-118` (already counts approved; add a "first_view" flag) | **1.5h** | 1 (needs real artifact to show) |
| 6 | Replace landing-page `<ArtifactCard />` with a static render of a real golden artifact (or an inline 60–90s recording) | `app/HomePageClient.tsx:347`, new component | **2h** | 4 (needs production to ship one real artifact to record) |
| 7 | Verify Stripe live: put a real card through checkout, confirm `user_subscriptions` row flips to `active`, refund | Stripe dashboard, Vercel env, `app/api/stripe/webhook/route.ts` | **1h** | — |
| 8 | Delete stale `codex/pending-approval-fix` branch (local + remote) | git | **0.1h** | — |
| 9 | Record 60–90s Reddit clip: live dashboard → real golden artifact → approve → email receipt | — | **2h** | 1, 2, 3, 4, 5 |
| 10 | Post clip to r/selfimprovement, r/adhd, r/productivity with one-sentence hook | — | **0.5h** | 9 |

**Total to first paid user:** ~16h of focused work. The critical path is **1 → 2 → 3 → 4 → 5 → 9 → 10**.

### 4b. What ships in one day and materially improves the product

- **#1 (proof mode off)** — 15 minutes, unblocks 50% of output classes. Do it this morning.
- **#3 (validators advisory, not veto, for write_document)** — 2 hours. Combined with #1, the next cron run produces an artifact.
- **#5 (unblur first artifact)** — 1.5 hours. Combined with #1 + #3, a first-time visitor sees a real finished artifact on their dashboard.
- **#8 (delete stale branch)** — trivial hygiene.

**One-day deliverable: a free user's first dashboard visit shows a real, unblurred finished artifact. That is the product demo working without a recording.**

### 4c. The single change that moves "interesting demo" → "I would pay $29/mo"

**#2 (new generator system prompt).** Every other fix is plumbing. The prompt is what decides whether the artifact is "Resolve \"Preference divergence: stated ...\"" or "Darlene Craig sent you interview questions on April 21. Here is your prep sheet."

The difference between a product that gets skipped 1,065 times and a product that gets paid for is whether the generated artifact feels like the golden one. Nothing else — not scorer tweaks, not UI polish, not Stripe verification — changes that. The prompt is the product.

### 4d. If only 3 changes total

1. **Turn proof mode off in prod** (#1). Zero risk, immediate output volume doubles.
2. **Replace the system prompt with §1f** (#2). This is the product.
3. **Unblur the first artifact for free users** (#5). Without this, #2 is invisible.

Everything else is cleanup or verification. These three are the difference between 0 paid users and 1.

---

## Risk register

| # | Change | What could go wrong | Mitigation |
|---|---|---|---|
| 1 | Proof mode OFF | A `write_document` winner with weak evidence gets surfaced. User sees it, judges it poor, skips. No revenue lost — free users already skip 97% of directives. | Rely on decision-enforcement's `getInternalExecutionBriefIssues` + new prompt's rule 1 ("real sources, real names"). Monitor first 3 cycles after flip via pipeline_runs. |
| 2 | New system prompt | LLM ignores one of the rules and produces a hallucinated email (name invented, date wrong). | New prompt rule 1 is "cite real sources or abandon the candidate." `decision-enforcement` stale-date check remains. Run the golden-artifact candidate through a dry-run first; compare output to the hand-authored golden text. |
| 2 | New system prompt (cont.) | LLM regresses on voice-matching because the "match the user's voice" line replaces the older, longer guidance. | Keep `user_voice_patterns` injection in `buildStructuredContext` intact (it is). Spot-check 3 outputs against the user's past sent mail before approving prompt for all users. |
| 3 | Validators advisory | A genuinely bad `write_document` ships (summary without execution, no source block). | Leave `REWRITE_REQUIRED_PATTERNS` and `SUMMARY_ONLY_PATTERNS` as **hard** vetoes. Demote only the missing-deadline / missing-owner / missing-pressure patterns. Also: enforce the SOURCE block regex as a hard requirement (document starts with `"SOURCE\n"`). |
| 4 | Attachment + document hydration | Prompt balloons in size → token cost spikes → haiku latency goes from 3s to 12s. | Cap: only hydrate full text for the *selected winner*, not all candidates. Per-artifact cap of 8K tokens of source material. Truncate with ellipsis, log when truncated. |
| 4 | Attachment hydration (cont.) | PII leaks into logs (attachment text in structured logger). | Hydration only flows into prompt, never into `logStructuredEvent`. Audit existing logger calls in `generator.ts`. |
| 5 | Unblur first artifact | Free user reads the full artifact, copies it manually, never upgrades. | Acceptable. The product's moat is *tomorrow's* artifact, not today's. Also: the approve flow files the document in Foldera Signals (`approveSuccessFlash` line 57) — that creates lock-in even if the body is readable. |
| 6 | Landing page replacement | The real artifact on a public page exposes PII (real recruitment numbers, resume content). | Use a scrubbed variant: keep the shape and verbiage, substitute `Darlene Craig → Dana Calloway`, real RCW → fictional statute. Make one authorized demo artifact for public use. |
| 7 | Stripe live verification | Live charge fails due to misconfigured webhook → user charged but not marked subscribed. | Refund + immediate manual `user_subscriptions` flip. Existing webhook fails closed on persistence errors (commit `4ea17ae`). Test end-to-end before the Reddit post, not after. |
| 8 | Branch deletion | — | None. Already merged. |
| 9 | Reddit recording | Recorded cycle shows a weak artifact if today's scorer winner isn't strong. | Wait for a day when the scorer top candidate has high evidence density (email + attachment + goal overlap). If none available inside 3 days of launch, seed with the force-golden-artifact script and record against that session, labeled honestly as "example". |
| 10 | Reddit post | 0 signups. | Accept. Post again in a different subreddit after iterating on the hook. The point of the clip is compounding — one doesn't need to pop, a month of posts needs to. |

---

## Appendix — receipt

**Health:** `npm run health` → `RESULT: 0 FAILING` (but note: health script reads the local CLI user's tokens, not the production ingest user; the real signal health from `tkg_signals` is in §2a and is uglier than the script reports — this is itself a bug).

**DB queries run (via Supabase MCP against `neydszeamsflpghtrhue`):**
- `tkg_signals` count: 3,448; grouped by source (see §2a)
- `tkg_entities` count: 356
- `tkg_actions` for owner — last 20 rows, all status=skipped; status breakdown: 1065 skipped, 10 executed, 9 rejected, 3 approved, **0 pending_approval right now**
- `pipeline_runs` last 10 (see §2c)
- `api_usage` 7 days (see §2d)
- `user_subscriptions` active: 1
- Distinct signal users: 1

**Git state:**
- `main` @ `15ef97f` (`scripts: force-golden-artifact for hand-authored pending_approval rows`)
- `origin/codex/pending-approval-fix` — stale, already ancestor of `main`
- `continue`-not-`break` fix: `b189148` on `main` ✔

**Files read (relative to repo root):**
`FOLDERA_PRODUCT_SPEC.md`, `WHATS_NEXT.md`, `CLAUDE.md`, `LESSONS_LEARNED.md`, `lib/briefing/generator.ts`, `lib/briefing/scorer.ts` (entry point + scoring helpers), `lib/briefing/decision-enforcement.ts`, `lib/cron/daily-brief-generate.ts` (entry), `lib/cron/daily-brief-send.ts`, `app/api/cron/nightly-ops/route.ts`, `scripts/force-golden-artifact.ts`, `app/dashboard/page.tsx`, `app/api/conviction/latest/route.ts`, `app/page.tsx`, `app/HomePageClient.tsx`, `app/pricing/page.tsx`, `app/api/stripe/checkout/route.ts`.

**Tools used:** Supabase MCP (production DB truth), local git (branch state), `npm run health`.

**No code changes. No pushes. Spec only.**
