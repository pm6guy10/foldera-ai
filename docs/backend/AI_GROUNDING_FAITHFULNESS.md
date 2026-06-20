# AI / ML Grounding & Faithfulness — Master Audit #445, Pass 5

> Status: written 2026-06-19. Read-only forensic pass over the brain's grounding
> chain — scorer → evidence resolution → directive worthiness → artifact quality
> gate → send — mapped against the AI/ML Engineer kill-questions in
> `docs/EXPERT_PANEL.md` §6. **No paid LLM calls** (the one fix that needs paid
> validation, C-2, is routed to the owner wall, not run here). This is the
> canonical "is the brain grounded or free-associating" record so it is captured
> once and never re-derived. Verdict: **`PASS`** (one soft-by-design observation
> recorded; the inherited C-2 quality/cost item carried forward).

---

## TL;DR

The brain is **grounded, not free-associating**, and it **fails closed**. A verdict
cannot reach the user unless it (1) survives the scored ranking
(`stakes × urgency × tractability × freshness` — recency is *penalized*, not
rewarded), (2) carries a **non-empty `evidence` array** (hard `no_evidence`
rejection — "must be grounded in real context"), (3) clears the **`fabricated_claim`
hard block** (a user-claim whose tokens aren't present in the evidence is rejected),
and (4) survives the adversarial fail-closed paths (stale evidence / already-acted →
generation fails closed). All four AI/ML kill-questions are answered in the
affirmative with live test coverage (37 grounding/invariant tests green).

One observation, **soft by design**: `no_source_grounding` — the check that the
artifact *text* lexically references its evidence — is a soft warning logged into
the send receipt, not a hard send blocker. This is acceptable because the hard
`no_evidence` worthiness gate has already run upstream; the soft layer only catches
the subtler "evidence exists but the prose doesn't cite it" case. Recorded, not
escalated.

The only material open item is **C-2** (carried from Pass 3/4): the *quality* of
the first-pass directive (≈74% fail validation → a second paid call). Improving
first-pass faithfulness is the AI/ML lever, but verifying it needs a paid
generation cycle → **owner wall**, not shipped blind.

---

## Kill-question scorecard (EXPERT_PANEL.md §6)

| # | Kill-question | Verdict | Where it's enforced |
|---|---|---|---|
| 1 | Every verdict grounded in a real source trail, not free-associating? Where's the evidence row? | **PASS** | Hard `no_evidence` gate (`daily-brief-generate.ts:574`, `generator.ts:5263`); `resolveEvidenceSignalIdsForWinner` maps `winner.sourceSignals` → real `tkg_signals.id` rows; `fabricated_claim` hard block in the quality gate. |
| 2 | On weak evidence, does it stay quiet rather than manufacture confidence? | **PASS** | Below-threshold → `below_send_threshold`; stale/already-acted → fails closed (adversarial TEST B); `NO_SAFE_ARTIFACT_TODAY` / suppression-decision path; safe-silence doctrine. |
| 3 | Winner chosen by a *scored* decision (stakes/urgency/freshness), not recency? | **PASS** | `scorer.ts` `score = stakes × urgency × tractability × freshness`; the **freshness multiplier decays toward 0.3 for recently-surfaced items** (anti-recency); ranking-invariants tests prove discrepancy > generic/recent. |
| 4 | Is there an eval/fixture proving the brain doesn't fabricate from thin signals? | **PASS** | `decision-payload-adversarial.test.ts` (hostile action-drift, stale-evidence fail-closed, renderer-only contract), `scorer-ranking-invariants.test.ts`, `artifact-quality-gate.test.ts`, `resolve-evidence-signal-ids.test.ts` — 37 tests green. |

---

## The grounding chain (how a verdict earns the right to be shown)

1. **Scored ranking** (`lib/briefing/scorer.ts`). Candidates carry `sourceSignals`.
   Score is the product of stakes/urgency/tractability/freshness. Freshness is a
   *penalty* on recently-surfaced items (1.0 never-surfaced → 0.3 surfaced-today),
   so recency cannot masquerade as relevance — the "magic invariant." The
   high-consequence stakes floor (#456) lifts genuinely high-stakes commitments so
   they aren't zeroed by the decision-moving/lifecycle gates.

2. **Evidence resolution** (`lib/briefing/resolve-evidence-signal-ids.ts`). The
   winner's `sourceSignals` are mapped to concrete `tkg_signals.id` values
   (commitments resolve through `source_id` to the originating signal). The evidence
   row is **real**, not synthesized.

3. **Worthiness gate** (`lib/cron/daily-brief-generate.ts:574`,
   `lib/briefing/generator.ts:5263`). **Hard reject** if `evidence` is empty
   (`no_evidence` — "must be grounded in real context"), below confidence threshold,
   or contains template placeholders.

4. **Artifact quality gate** (`lib/briefing/artifact-quality-gate.ts`). **Hard
   blocks** (set `passes:false`): `internal_debug_token`, `placeholder_content`,
   `stale_event`, `fabricated_claim`, `transactional_sender_decision_pressure`,
   `relationship_silence_artifact`, `action_type_mismatch`,
   `decision_no_concrete_outcome`. **Soft warnings** (logged, non-blocking):
   `no_source_grounding`, `reminder_only`, `summary_only`, `generic_coaching`,
   `prepare_instead_of_finished_work`, `only_follow_up_check_in_or_monitor`,
   `no_concrete_outcome`.

5. **Send gate** (`lib/cron/daily-brief-send.ts:603`). `!gate.passes` →
   `artifact_quality_gate_blocked` suppression + quiet-hold receipt; the send is
   skipped. Soft warnings are written into `daily_send_receipt.soft_warnings` for
   observability but do **not** block delivery.

---

## Observation O-5.1 — `no_source_grounding` is soft, not hard (by design)

At the send gate, an artifact whose prose does not lexically reference its evidence
(`hasSourceGrounding` false: neither the `SOURCE_PATTERN` keywords nor any
≥5-char evidence token appears in the text) is **delivered with a soft warning**,
not suppressed.

- **Why this is acceptable.** The hard `no_evidence` worthiness gate (step 3) has
  already guaranteed a non-empty, real evidence array before the artifact was ever
  generated. `no_source_grounding` is a *second-layer prose-citation* check; making
  it a hard blocker would suppress legitimate well-grounded cards that happen to
  paraphrase rather than quote their source. It is correctly a quality signal, not
  a safety gate.
- **Residual risk.** Low. The path requires: real evidence present, no fabricated
  claim, but text that avoids all source keywords AND shares no ≥5-char token with
  the evidence. Rare in practice; logged and observable if it occurs.
- **Verdict.** Recorded as soft-by-design. **No change shipped.** If a future
  faithfulness eval shows ungrounded prose slipping through, the lever is to
  promote `no_source_grounding` to a hard block for `write_document`/`send_message`
  categories only.

---

## Carried forward — C-2 (first-pass directive validation quality)

≈74% of first directive attempts fail validation (hostile/non-canonical action
type, contract violations) and trigger a full second paid LLM call (root-caused in
Pass 4, `docs/backend/RUNTIME_CORRECTNESS.md`). This is the **AI/ML faithfulness
lever for Pass 5**: a more faithful first pass cuts both cost (~2× → ~1×) and
latency. The fail-closed behavior is *correct* (TEST A proves the bad first pass is
rejected, not delivered) — the issue is purely that it *costs* before producing
value.

**Deferred to the owner wall.** Any first-pass-quality change (prompt/contract
tightening, candidate-of-N faithfulness selection per §6's "evaluate multiple
candidates, pick the most faithful") must be validated against a **paid generation
cycle** to confirm the first-pass success rate actually rises. It is not shipped
blind. Tracked as the Pass 5 → paid-validation handoff.

---

## Proof

- `npx vitest run` over `scorer-ranking-invariants`, `decision-payload-adversarial`,
  `artifact-quality-gate`, `resolve-evidence-signal-ids` — **37 passed (4 files)**,
  2026-06-19.
- No paid LLM calls made in this pass.

---

## #481 FORMAT GAP — grounding was silently dropping readable source (FIXED, 2026-06-20)

**The bug class.** `decryptWithStatus` returns `usedFallback: true` for **two
different** conditions: (a) AES-GCM ciphertext it could not decrypt (wrong/missing
key), and (b) a legacy row stored as **plaintext** (never encrypted). Every grounding
evidence loader dropped rows on `usedFallback` alone:

```ts
const decrypted = decryptWithStatus(row.content);
if (decrypted.usedFallback) continue;   // ← also discards readable plaintext
```

**Measured impact (owner's live signals, `scripts/swoop-481-decrypt-classify.ts`):**
of 5,594 signals, 633 (11%) are `not_base64` — stored plaintext — and were being
silently excluded from grounding. The worst-hit source is **`uploaded_document`:
357 of 390 rows** (resumes, packets, filings — the richest grounding material the
brain has), plus 239 `claude_conversation` and 37 `chatgpt_conversation` rows.
(A separate 24% `valid_gcm_authfail` band is a real key gap — verify prod
`ENCRYPTION_KEY_LEGACY`; that is config, not code.)

**The fix class.** A shared discriminator `looksLikeEncryptedPayload(raw)` (long +
pure base64 ⇒ ciphertext; plaintext fails the base64 test) gates the drop:

```ts
if (decrypted.usedFallback && looksLikeEncryptedPayload(rawContent)) continue;
```

So only genuinely-unreadable ciphertext is skipped; readable plaintext flows into
grounding via `decrypted.plaintext`. Applied at every grounding drop site:
`lib/briefing/generator.ts` (`fetchWinnerSignalEvidence` + the full-body hydration
loop) and `lib/signals/entity-trust-repair.ts`. `outcome-autopsy.ts` already did the
right thing with a local copy of the same heuristic.

**Proof.** `lib/__tests__/encryption.test.ts` (round-trip + discriminator + the
"plaintext uploaded document is kept" case); full `lib/briefing/` + `lib/signals/` +
`lib/outcome-autopsy/` suites green (989 tests); typecheck + build green. No paid
LLM calls. Additive by construction — it can only *add* real source to grounding,
never remove it.

**Still open (separate seams, not shipped here):** (1) generalize full-body
hydration beyond interview-class winners (`winnerWarrantsFullBodyHydration` —
deferred: needs runtime-fixture coherence + a paid validation cycle); (2) verify the
24% key gap in prod (`ENCRYPTION_KEY_LEGACY`).
