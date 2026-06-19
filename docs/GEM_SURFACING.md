# What a Gem Is — and why "promote relationship-silence" was the wrong fix

> Master Audit #445, product-quality thread. This doc corrects a wrong turn and pins
> the gem definition to doctrine (`FOLDERA_MASTER_BIBLE.md` Part II-B/II-C,
> `docs/BRANDON.md`) so it is not re-derived.

## The wrong turn (recorded so we don't repeat it)

The engine fires daily but delivers nothing (`generation_failed_sentinel → do_nothing`).
Tracing it, the top blocked candidate was *"High-value relationship at risk: roman."*
I concluded the quality gate was too strict and shipped a change to promote
`relationship_risk_silence` candidates to a winnable tier (#452).

**That was wrong.** `roman` is **noise** — a Handshake/Slack broadcast sender pushing
general updates, never a 1:1. The gate that suppressed it was **correct**. The fix
pointed the product *at the 95% automated noise it exists to filter out.* #452 was
reverted.

## What a gem actually is (doctrine, verbatim intent)

From the Bible's "What 'Magical' Means" (Part II-C):

> *"How did it know?"* — Foldera surfaced **the one thing the user had half-forgotten,
> at the exact moment they needed it, in the place they already were, and they did not
> have to ask.**

A gem requires **all four**, or it's not a gem:
1. **Right signal** — a *high-consequence* buried thing (the Bible's hidden-op domains:
   `work_transition`, `medical`, `money`, `family_baby`, `legal_gov` …), not automated exhaust.
2. **Right time** — imminent / about to matter (the imminence multiplier).
3. **Right channel** — where the user already is.
4. **One clear act** — one click = done.

And the hard truth about the input (Part II-C): *"a knowledge worker has GitHub noise,
Slack loops, PM artifacts, calendar density — **95%+ automated noise by volume**."*
**roman is that 95%.** A calendar reminder is also not a gem (BRANDON.md §5.1, §9:
"safe silence is a win"). A gem is the buried human-consequence obligation, surfaced
once, at the right moment.

## The real lever (forward work, not done here)

Not "loosen the gate." The opposite:
1. **Harden noise suppression.** roman beat `TRANSACTIONAL_SENDER_RE`
   (`lib/briefing/artifact-taste-pack.ts`) — that guard only catches a few literal
   `noreply@…` domains. Broadcast/automated senders (Handshake, Slack app updates,
   notification digests) should be classified as transactional and **never become
   relationship candidates**. This is pure noise reduction — the right direction.
2. **Surface the high-consequence domains.** Confirm the hidden-op detector's domains
   (`money`/`legal_gov`/`medical`/`work_transition`/`family`) are what rises, with the
   imminence multiplier — and that when one exists, it clears the gate with one act.
3. **Accept correct silence.** If the connected data is genuinely all broadcast noise +
   low-stakes personal right now, the engine *should* stay quiet. "Safe silence is a
   win" — do not manufacture a card to look busy.

## Validation rule for any future gem change

Before promoting anything: would it have surfaced **roman**? If yes, it's wrong. Test
against the real noise in the data, not a hand-built fixture — the fixture passed while
the live winner was garbage. Live/paid validation against actual signals is the only
real proof here.
