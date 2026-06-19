# Frontend Design & UX — Master Audit #445, Pass 7

> Status: written 2026-06-20. Forensic pass over the user-facing surfaces
> (landing `components/foldera/LandingPage.tsx`, dashboard
> `components/dashboard/MorningAnchorCard.tsx`) against the Product Designer (§2),
> UX Researcher (§3), and Growth (§1) kill-questions in `docs/EXPERT_PANEL.md`.
> No paid calls. Verdict: **`PASS`** (no design/UX blockers; observations recorded).

---

## TL;DR

The landing and dashboard already sit at the Linear/Vercel restraint bar (the
frontend overhaul epic #382 did the heavy lifting). **One dominant CTA** ("Start
free") repeated across header / hero / pilot; the logo returns home; **all nine
referenced routes resolve** (no dead links); amber accent appears **7 times across
the entire long page** (punches, isn't wallpaper); icons are a single consistent
`lucide` set with **no Sparkles/magic-wand AI-clichés**; brand logos are real SVGs,
not faked. The dashboard Right Now card honors the Bible's one-click control
contract (View Draft + Dismiss) and shows the next move **with its evidence**
(recognition over recall).

---

## Panel scorecard

### Product Designer (§2) — `PASS`
- **One focal point per section?** Yes — hero = H1 + product window; each section
  has a single headline + supporting grid. Eye doesn't wander.
- **Amber spent sparingly?** Yes — 7 accent references across the full page
  (eyebrow, one stat unit, doctrine icon #3, CTAs, signal dot). It punches.
- **Cheap tells?** None found — `grep` for `sparkle|wand|magic` = 0; consistent
  `lucide` icon set; real connector logos via `next/image`; depth via shadow/borders,
  not neon glass.

### UX Researcher (§3, Nielsen) — `PASS`
- **System status:** the Right Now card surfaces `verdict_line` + `source_line` +
  `last_interaction` — the user sees what Foldera saw and whether it acted.
- **User control:** one-click `View Draft` / `Dismiss` (`MorningAnchorCard.tsx:156`);
  no multi-step workflow to answer one prompt.
- **Recognition over recall:** the next move is shown **with its evidence rows**
  (landing product window + dashboard `source_line`), not a bare reminder.
- **Unbroken journey:** logo → `/`; nav (`#how-foldera-works`, `/security`,
  `/pricing`, `/try`) and footer (`/about`, `/privacy`, `/terms`, `/demo`,
  `/start`, `/login`) — **all 9 routes verified to exist** (no dead links).

### Growth (§1) — `PASS`
- **5-second test:** H1 "Stop rebuilding the work / The reconstruction tax ends
  here" is outcome-driven; subhead names the mechanism plainly ("holds the thread
  across your apps, then pings you in Slack with the one finished move").
- **One dominant action?** Yes — "Start free" is the single repeated CTA; the only
  secondary is a low-emphasis ghost "See how it works" anchor.
- **Outcome over features?** Yes — the doctrine grid (State/Connectors/Triggers/One
  move) is framed as outcomes, not a feature checklist.

---

## Observations (recorded, not blockers)

- **O-7.1 — "Workday Presence Layer" eyebrow** is internal jargon. It sits *above*
  the plain-language H1 as a category label, and the subhead translates it, so it
  does not fail the 5-second test. If a future conversion test shows hesitation,
  the lever is to demote/soften the eyebrow — not a Pass-7 fix.
- **O-7.2 — Enterprise strip** ("SSO / SCIM", "SAML 2.0 ready") makes capability
  claims. These are **routed to Pass 8 (Trust & Honest-Claims)** for the
  forbidden-claim / proof-lag check, which owns claim verification.

---

## Proof

- Route existence verified for all 9 landing/footer hrefs (`app/<route>/page.*`).
- Amber-accent count = 7 across the full landing file; cheap-tell icon grep = 0.
- No code change required — design/UX posture already meets the bar.
