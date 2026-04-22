# CURRENT STATE — FOLDERA

## A. WHAT IS WORKING

- **Discrepancy detection is live** — `lib/briefing/discrepancy-detector.ts` implements absence-based, delta-based, and **cross-source** classes (calendar prep gaps, open-thread-before-meeting, schedule conflicts, stale drive documents, document follow-up gaps, assistant-chat unresolved intent, multi-channel convergence). All are pure functions over pre-fetched rows; `scoreOpenLoops()` passes `structuredSignals` (decrypted `tkg_signals` with `source_id`) and `recentDirectives` (`tkg_actions` excerpts).
- **Insight scan (unsupervised patterns)** — `runInsightScan` in `lib/briefing/insight-scan.ts` asks what pattern the user has not named, using raw decrypted signals (not extractor-shaped gaps). Produces 0–2 candidates per scorer run, injected as `behavioral_pattern` discrepancies with `fromInsightScan`; discovery log surfaces them as `candidateType: insight`. Competes in the normal scored pool after structural discrepancies. Skips when in-window signals < 10 or daily spend > $0.75.
- **Entity skip penalty is send_message-only** — `getEntitySkipPenalty` still runs for every open-loop candidate, but only `send_message` retains the penalty; `write_document`, `make_decision`, and `schedule` use `entityPenalty: 0` so calendar/drive-shaped loops are not nuked for missing email match.
- **Time-aware urgency** — `mergeUrgencyWithTimeHints()` boosts urgency from upcoming calendar starts (today = cap 1.0, ≤1 day +0.2), commitments due within 48h (+0.15), and cold-entity meeting prep (+0.25 from discrepancy `scoringHints`).
- **DecisionPayload authority is enforced** — LLM cannot override `action_type`. The canonical action is locked pre-LLM via `buildDecisionPayload()` and restored post-LLM via `canonicalAction` enforcement in `generateDirective()`.
- **Discrepancy candidates pass scoring and persist** — freshness gate, entity suppression gate, and blocking_reason guards are all bypassed correctly for `winner.type === 'discrepancy'`. Drift, exposure, and risk candidates surface in the scored pool.
- **Empty thread-backed pool no longer skips discrepancy detection** — `scoreOpenLoops` used to return `no_valid_action` immediately after the entity reality gate or stakes gate when no mail/relationship/commitment rows remained, *before* `detectDiscrepancies()` ran; that prevented calendar/drive structural candidates (e.g. `schedule_conflict`) from ever entering the pool. Fixed 2026-04-13: continue past those gates so cross-source discrepancies still score.
- **Artifact generation executes and produces valid structured output** — `generateArtifact()` routes discrepancy candidates through a flavor-aware LLM transformation (`buildDiscrepancyTransformPrompt`). The transformation layer detects raw analysis dumps via `isAnalysisDump()` and replaces them with finished, zero-thinking-required artifacts.
- **End-to-end pipeline is functional** — `signals → discrepancy extraction → scoring → DecisionPayload → generation → persistence` has been verified in production. At least one production `write_document` artifact at confidence ~79 has been generated and persisted to `tkg_actions`.
- **Generic filler rejection is live** — `GENERIC_FILLER_PATTERNS` validator rejects social maintenance language from all artifact types.
- **Entity classification on ingestion** — `classifyEntityTrustClass(email, interactions)` runs on every entity insert/update in `signal-processor.ts`. Rules: `.gov`/`.org` domain = trusted; noreply/no-reply/newsletter/marketing pattern = transactional; email + ≥1 interaction = trusted; 0 interactions = junk. Prevents unclassified entity accumulation without batch cleanup.
- **Signal dedup across providers** — Both `google-sync.ts` and `microsoft-sync.ts` already use a normalized `content_hash` (`sender+subject+date`) with `onConflict: 'user_id,content_hash', ignoreDuplicates: true`. Confirmed working — same email received via Gmail and Outlook produces one row.
- **`/api/health` lite vs full** — Default `GET /api/health` is a **lite** probe (one DB read + env + canary + `revision`); `?depth=full` or `?full=1` runs the full column/RPC contract. Cron + schema smoke + operators checking migration drift use **full**; external uptime and casual SHA checks can stay on the default URL to reduce Fluid CPU.
- **Rate limiting on public routes** — `/api/try/analyze` uses DB-backed `rateLimit()` (5/hour per IP). `/api/resend/webhook` uses a module-level in-memory counter (10/min per IP, best-effort on Vercel cold starts).
- **Email send idempotency** — `daily-brief-send.ts` checks both `daily_brief_sent_at` (existing guard) and `resend_id` (new guard) before calling Resend. After a successful send, `resend_id` is stored in `execution_result` alongside `daily_brief_sent_at`. Cron double-fire cannot produce duplicate sends.
- **Hallucination guard in send_message prompt** — Both send_message prompt locations in `generator.ts` now include a `GROUNDING RULE` prohibiting fabricated professional relationships, shared projects, organizational roles, or budget contexts that don't appear in signal data.
- **Artifact generator resilience + class-aware discrepancy transform** — `loadRelationshipContext()` failures no longer throw out of `generateArtifact()` before the Haiku transform try/catch (they fall back to “No relationship data available.”). `discrepancyClass` is copied onto `ConvictionDirective` for discrepancy winners; `detectDiscrepancyFlavor()` uses class first so `schedule_conflict` never picks the “person” outreach template just because `reason` mentions “reconnect”. `evaluateBottomGate()` has a **schedule_conflict + write_document** path: numbered calendar-resolution steps + ISO date satisfy concrete-move / pressure without requiring an external named recipient.

## B. WHAT IS BROKEN (REAL)

- **Interview write_document non-enforcement blockers** — Hydration + class-aware enforcement/bottom-gate relaxation allow recruiter-facing confirmation drafts to reach `pending_approval`. Owner runs can still fail on **LLM JSON refusal**, **low_cross_signal** when `send_message` sorts first, or other gates unrelated to explicit-ask/concrete-ask mismatch for interview docs.
- **Post-deploy verification** — After `fix: autonomous brain quality loop`, run owner `POST /api/dev/brain-receipt` once deploy is READY to confirm `schedule_conflict` → `write_document` persists `pending_approval` (not `Artifact generation failed.`).
- **Production-like proof blocked** — `scripts/run-brain-receipt-real-once.ts` is currently blocked by `paid_llm_disabled` during signal processing, so a fresh `schedule_conflict` → `write_document` artifact cannot be generated yet (no pending_approval persisted from that path).
- **Convergence depends on name overlap** — `extractConvergence` requires the entity name to appear in signal bodies; calendar titles without names may under-match.
- **Confidence scores remain variable** — richer candidates help, but thin relationship context still pulls confidence down.

## C. CURRENT LAYER OF WORK

- **Verify in production** — brain-receipt + one nightly-ops cycle; confirm scorer diagnostics list non-email discrepancy classes and larger pre-rank pool.
- **Tune extraction thresholds** — burst/idle windows for stale documents, follow-up day counts, intent phrase regex if false positives appear.

## D. CONSTRAINTS

- Discrepancy detector stays a **pure function** — no DB calls, no async; all calendar/drive/conversation rows are fetched in `scorer.ts` and passed in.
- Each discrepancy row carries `TriggerMetadata` + JSON `evidence` with baseline/current/delta/timeframe/entity where applicable.
- Preserve existing absence-based extractors (decay, exposure, drift, avoidance, risk) and delta-based extractors unchanged in behavior except sort order relative to new cross-source block.
- Trigger → action lock: `TRIGGER_ACTION_MAP` must include every `DiscrepancyClass` key; `unresolved_intent` may set `discrepancyPreferredAction` (generator prefers it over `resolveTriggerAction`).
