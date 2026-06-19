# Foldera Cost & Economics Audit

> Status: written 2026-06-19. Single source of truth for the unit-economics problem
> and the fix. If you read nothing else, read the TL;DR.

---

## TL;DR — what actually matters

**The problem (one sentence):** the daily cron runs the full *paid* pipeline —
extract every signal → summarize → score → generate — for **every connected user,
every day, whether or not anything is worth sending.** Cost scales with
`users × days`, not with value delivered.

**The economics:** $29/mo = **$0.97/day/user**. The pipeline can spend up to
**~$5/day/user** (capped) and probably $0.10–0.50 on a typical active day. That is
margin-thin at best and underwater on busy days.

**The one fix that matters:** make generation **as-needed, right-now** — the cheap
deterministic brain decides *whether* a card is warranted (free), and the paid draft
is only generated when something clears the bar and, ideally, when the user actually
opens the card. Dormant user → ~$0. Active user → a few cents on days they engage.

**Everything else in this doc is secondary.** Do the as-needed rebuild + revert the
extraction cap first; the rest is guardrails and hygiene.

**What you do NOT need to worry about (already fine):**
- Cadence is already free: one Vercel daily cron + event-driven triggers.
- The GitHub Actions cron dead-ends are gone (all `workflow_dispatch`).
- `ANTHROPIC_API_KEY` is set; spend caps are active in code; the repo is clean.
- The dry-run flag you just deleted was the old, blunt cost control. The caps + the
  as-needed rebuild replace it properly.

---

## 1. The economics verdict

| | |
|---|---|
| Revenue | $29/mo ≈ **$0.97/day/user** |
| Generation cap | **$1.00/day/user** (`DAILY_SPEND_CAP_USD`) |
| Extraction/summarization cap | **$4.00/day/user** (`EXTRACTION_DAILY_CAP`, default left at 4) |
| Manual "Generate Now" cap | 3 calls/day |
| Model | Haiku (`claude-haiku-4-5`) — already the cheap one |

The caps prevent a runaway bill, but the **shape** is wrong: you pay to think hard
about every connected user every day, even when the honest answer is "nothing to
send." COGS should track cards delivered/viewed, not user-count × days.

## 2. Where the money goes (from the code)

| Driver | When it runs | Cost shape |
|---|---|---|
| Per-signal extraction + summarization (`lib/extraction/conversation-extractor`, `lib/signals/summarizer`, `lib/briefing/insight-scan`) | Daily, every connected user, every signal | The real volume. Scales with signals × users. Capped $4/day/user. |
| Directive generation (1 Haiku draft for the scored winner) | Daily, every eligible user | The small part. Capped $1/day/user. |
| Supabase egress (reading signals/commitments/artifacts to build context) | Every cron run + every sync + every dashboard load | **No automatic cap.** Only the manual `FOLDERA_EGRESS_EMERGENCY_MODE` switch. |

**Eligibility** (`getEligibleDailyBriefUserIds`): every user with connected
Google/Microsoft tokens or a `self` entity in the graph. So the burn is N-users-wide.

There IS a circuit breaker: `checkApiCreditCanary()` blocks the whole daily run if
API credits look exhausted. That's a backstop, not a unit-economics fix.

## 3. Root cause

Eager, daily, N-users-wide full pipeline. The expensive LLM work and the Supabase
reads happen for everyone every day, decoupled from whether a card worth showing
results.

## 4. The fix — "as-needed, right-now cards"

Split the cheap brain from the expensive hands, and only spend when a card is
warranted AND wanted:

1. **Detect/score stays daily + free.** The deterministic brain (triggers, scoring,
   command-state resolver) decides *whether* a user has anything clearing the bar
   today. No LLM unless something does.
2. **Generation becomes lazy.** Don't draft eagerly. Call Haiku only when (a) a
   scored winner crosses a real threshold, and ideally (b) **at the moment the user
   opens the card** (dashboard/Slack tap) — generate-on-view. No engagement → no spend.
3. **Extraction becomes selective.** Pre-filter signals (dedup, low-value drop, cheap
   heuristics) so the LLM only touches signals that could matter.

Result: COGS tracks engaged cards, not `users × days`. A sane $29/mo product.

## 5. Prioritized fixes

### P0 — stop the bleed
1. Revert `EXTRACTION_DAILY_CAP` **4 → 0.25** (`lib/utils/api-tracker.ts`; 16× over its
   own documented intent, never reverted). One line, instant worst-case cut.
2. **Lazy generation:** gate the paid draft behind a "warranted" threshold +
   generate-on-view, instead of eager daily. The core change.
3. **Selective extraction:** pre-filter signals before the LLM pass.

### P1 — durable guardrails
4. **Automatic egress guard** (not just manual emergency mode): trim `SELECT`s (stop
   pulling full artifact bodies repeatedly), add a daily egress ceiling + alert.
5. **Document every spend/egress flag + cap** in `.env.example` + `CLAUDE.md`
   (see §7 — these were undocumented, which caused days of wrong "set the API key"
   diagnosis).
6. **Live cost readout on ops-health** — today's spend vs caps + gate state at a URL.

### P2 — efficiency
7. Verify prompt caching (`lib/llm/anthropic-prompt-cache.ts`) is actually applied;
   trim prompt sizes and `max_tokens`.
8. Per-user idle-skip: if a user has no new signals since the last run, skip the whole
   pipeline for them that day.

## 6. Latent issues found (not previously flagged)

- **Extraction cap silently at $4** — temp 2026-04-09 raise, never reverted. Hidden
  16× cost multiplier.
- **Spend/egress flags undocumented** — root cause of the "is it the API key?" loop.
- **No automatic egress cap** — one bad loop = uncapped Supabase bill.
- **`ALLOW_PROD_PAID_LLM` still set in Vercel** — vestigial now; harmless, clean it up.
- **Several Vercel secrets flagged "Needs Attention"** (not marked Sensitive) — hygiene.

## 7. Cost-control reference (so this stops being hidden)

Production generation runs the real paid path only when ALL hold:

- `ANTHROPIC_API_KEY` set (it is).
- `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN` ≠ `true` (forces the cron to skip Anthropic;
  **owner deleted this 2026-06-19**).
- `isPaidLlmAllowed()` true: in prod that means `PROD_DEFAULT_PIPELINE_DRY_RUN` ≠
  `true` (legacy path → paid on), OR if it is `true`, then `ALLOW_PROD_PAID_LLM=true`.

Spend caps (`lib/utils/api-tracker.ts`, hardcoded/enforced):
- `DAILY_SPEND_CAP_USD = 1.00` — generation, per user/day (cron bounded by this).
- `EXTRACTION_DAILY_CAP` = `EXTRACTION_DAILY_CAP_USD` env OR default `4` — extraction.
- `MAX_MANUAL_DIRECTIVE_CALLS_PER_DAY = 3` — manual "Generate Now".

Egress:
- `FOLDERA_EGRESS_EMERGENCY_MODE=true` — manual kill switch; blocks sync + dev routes.
  No automatic egress cap exists.

Cadence (both free):
- Vercel cron: `/api/cron/morning-pipeline` daily 11:00 UTC (`vercel.json`).
- Event-driven trigger-runner: fires on sync + Slack interaction routes.
- Zero scheduled GitHub Actions crons remain (all `workflow_dispatch`).

## 8. Recommended sequence (the "start fresh" plan)

1. **P0.1 — revert extraction cap to 0.25** (1 line, instant, safe).
2. **P0.2 — as-needed/lazy generation** (the real economics fix).
3. **P0.3 — selective extraction.**
4. Then P1 guardrails (egress cap, docs, ops-health readout), then P2 efficiency.

Each ships through the normal gate (build + public-routes smoke) and squash-merges to
`main`, leaving the control plane in the clean between-rungs form.
