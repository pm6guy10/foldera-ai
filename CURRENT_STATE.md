# CURRENT STATE — FOLDERA

## A. WHAT IS WORKING

- **Discrepancy detection is live** — `lib/briefing/discrepancy-detector.ts` implements 5 structural discrepancy classes (decay, exposure, drift, avoidance, risk). Candidates are injected into the scorer pool and compete against open-loop candidates.
- **DecisionPayload authority is enforced** — LLM cannot override `action_type`. The canonical action is locked pre-LLM via `buildDecisionPayload()` and restored post-LLM via `canonicalAction` enforcement in `generateDirective()`.
- **Discrepancy candidates pass scoring and persist** — freshness gate, entity suppression gate, and blocking_reason guards are all bypassed correctly for `winner.type === 'discrepancy'`. Drift, exposure, and risk candidates surface in the scored pool.
- **Artifact generation executes and produces valid structured output** — `generateArtifact()` routes discrepancy candidates through a flavor-aware LLM transformation (`buildDiscrepancyTransformPrompt`). The transformation layer detects raw analysis dumps via `isAnalysisDump()` and replaces them with finished, zero-thinking-required artifacts.
- **End-to-end pipeline is functional** — `signals → discrepancy extraction → scoring → DecisionPayload → generation → persistence` has been verified in production. At least one production `write_document` artifact at confidence ~79 has been generated and persisted to `tkg_actions`.
- **Generic filler rejection is live** — `GENERIC_FILLER_PATTERNS` validator rejects social maintenance language from all artifact types.
- **Entity classification on ingestion** — `classifyEntityTrustClass(email, interactions)` runs on every entity insert/update in `signal-processor.ts`. Rules: `.gov`/`.org` domain = trusted; noreply/no-reply/newsletter/marketing pattern = transactional; email + ≥1 interaction = trusted; 0 interactions = junk. Prevents unclassified entity accumulation without batch cleanup.
- **Signal dedup across providers** — Both `google-sync.ts` and `microsoft-sync.ts` already use a normalized `content_hash` (`sender+subject+date`) with `onConflict: 'user_id,content_hash', ignoreDuplicates: true`. Confirmed working — same email received via Gmail and Outlook produces one row.
- **Rate limiting on public routes** — `/api/try/analyze` uses DB-backed `rateLimit()` (5/hour per IP). `/api/resend/webhook` uses a module-level in-memory counter (10/min per IP, best-effort on Vercel cold starts).
- **Email send idempotency** — `daily-brief-send.ts` checks both `daily_brief_sent_at` (existing guard) and `resend_id` (new guard) before calling Resend. After a successful send, `resend_id` is stored in `execution_result` alongside `daily_brief_sent_at`. Cron double-fire cannot produce duplicate sends.
- **Hallucination guard in send_message prompt** — Both send_message prompt locations in `generator.ts` now include a `GROUNDING RULE` prohibiting fabricated professional relationships, shared projects, organizational roles, or budget contexts that don't appear in signal data.

## B. WHAT IS BROKEN (REAL)

- **Candidate quality is still low-signal** — current discrepancy extractors detect *absence* (no contact, no signal, no artifact). They do not detect *change* or *deviation*. A candidate saying "you haven't talked to X in 45 days" is less actionable than "X's response rate dropped 70% in the last 14 days after 6 months of regular contact."
- **No delta/change-based detection** — the system cannot currently measure: engagement velocity collapse, relationship dropout after active period, deadline staleness with recent-update tracking, or goal-level velocity mismatch (recent vs historical signal density).
- **Generator output is limited by weak inputs, not generator failure** — the generator pipeline is sound, but if the incoming candidate only carries absence evidence, the artifact ceiling is low. Improving candidate quality is the primary lever.
- **Confidence scores are variable** — when the top discrepancy candidate has no relationship context or signal thread, confidence drops and the artifact quality drops proportionally.

## C. CURRENT LAYER OF WORK

- **Improve discrepancy signal quality** — add delta-based extractors that measure change vs baseline, not just absence
- **Prioritize delta/change-based detection**: engagement velocity collapse, relationship dropout, deadline staleness, goal velocity mismatch
- **Do NOT rebuild pipeline, scoring, lifecycle, or cron** — these are stable

## D. CONSTRAINTS

- Do not touch: `generator.ts`, `scorer.ts`, `daily-brief*.ts`, `nightly-ops`, Supabase migrations, or any cron logic
- Discrepancy detector is a **pure function** — no DB calls, no async, takes already-fetched data
- Changes are limited to `lib/briefing/discrepancy-detector.ts` and its test file
- Each new extractor must include: baseline metric, current metric, delta %, timeframe, entity (if applicable)
- Do not emit candidates without measurable deltas
- Keep existing 5 absence-based classes unchanged
- Delta-based candidates rank higher via higher urgency values (0.72–0.85 vs 0.55–0.70)
