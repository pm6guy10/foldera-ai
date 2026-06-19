# Gem Surfacing — why Foldera went silent, and the value-inversion behind it

> Master Audit #445, product-quality thread. Owner directive: *"surface gems, not just
> a calendar reminder."* This doc captures the root cause and the first fix so it's
> never re-derived.

## The symptom (live, 2026-06-19)

The daily engine fires (3× today), the API key works, signals are fresh (984/14d, 0
unprocessed), 214 commitments are risk-scored. Yet every run ends
`generation_failed_sentinel → do_nothing`. No card reaches the user — and it's been
that way for 8+ days. **Not infra, not the key, not selection — a quality gate.**

## The root cause: the taxonomy's value system is inverted

Generation only ships a card if a candidate clears the `positive_winner_contract`,
which requires a **tier_1/tier_2** "artifactable" winner. Tiers are assigned by
`artifact_family` in `lib/briefing/artifact-taste-pack.ts` (`tierFor`):

| Family | Tier (before fix) |
|---|---|
| `interview_role_fit_packet` | tier_1 |
| `admin_deadline_decision_packet` | tier_1 |
| `calendar_conflict_brief` | tier_1 |
| `review_only_follow_up_draft` | tier_2 |
| **`relationship_risk_silence`** | **tier_3** (can never win) |

So the code's "top gems" are deadline / admin / calendar artifacts — **exactly the
reminders the owner calls noise** — while *relationship insight* (a high-value contact
going quiet, an unanswered thread — the non-obvious dropped ball Foldera exists to
catch) was hardcoded `tier_3` AND additionally blocked unless its text happened to
contain a work keyword (`relationship_silence_without_command_center_artifact`).

**The value system was upside-down relative to the product's purpose.** When the
current data is ordinary life (e.g. "Bible study Friday, nothing booked"), the only
gem-shaped candidates (relationship silence) are structurally suppressed, so the
product says nothing — looking broken when it's actually mis-prioritized.

## The fix (first cut) — discerning promotion, not a floodgate

A relationship-silence candidate is promoted to **tier_2** (a real gem) and unblocked
**only when it is grounded**: `>= 2 source facts` from a thread **within 14 days** — a
genuine, recent, two-way dropped ball. Vague/thin/stale "you've gone quiet" stays
`tier_3` and suppressed. This keeps the bar high (no creepy "you haven't texted mom"
noise) while letting the gems through.

- Code: `lib/briefing/artifact-taste-pack.ts` (`evaluateCandidateArtifactability` +
  `tierFor` promotion).
- Proof (deterministic): `tests/briefing/__tests__/gem-tiering.test.ts` — grounded gem
  → tier_2/artifactable/unblocked; vague → tier_3/blocked; stale → tier_3. Full
  briefing suite (812 tests) + typecheck green, no regression.

## What this does NOT prove yet (owner gate)

Whether the promoted gems actually read as *gems* (not noise) in production requires a
**live paid generation run** — Anthropic credits exist, but the run needs the
production env (key + Supabase), which is owner-side. **This change is
`BLOCKED_WITH_EXACT_RECEIPT` on that validation before it should be trusted live:**
deploy, run one generation cycle, and confirm the surfaced card is a real
relationship gem worth the interrupt. If it reads as noise, tighten the grounding
criteria (e.g. require a high-value/business entity via `trust_class`, or an explicit
unanswered-inbound open loop).

## The bigger decision this opens (owner)

This is one family. The full "what is a gem" definition is the product's soul:
- Should **cross-signal discrepancies** (a commitment + a contradicting email + a
  calendar gap) outrank single-source deadline artifacts?
- Should `tier_1` be re-ordered so *insight density* beats *artifact shape*?

Those are deliberate re-tunings to do with paid validation, not blindly. This fix is
the first, safe, reversible step that turns the lights on for the gem the data already
contains.
