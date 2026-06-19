# Frontend Performance & Accessibility — Master Audit #445, Pass 6

> Status: written 2026-06-19. Forensic pass over the public landing surface
> (`components/foldera/LandingPage.tsx` + `app/globals.css`), mapped to the
> Frontend Performance & Accessibility Engineer kill-questions in
> `docs/EXPERT_PANEL.md` §8. Verified empirically against the running dev server
> at the 375px mobile viewport (no paid calls). Verdict: **`PASS`** (two sub-44px
> tap targets fixed in-pass).

---

## TL;DR

The landing page is built perf/a11y-conscious: `MotionConfig reducedMotion="user"`
covers framer-motion, and the raw CSS keyframe animations (`.ld-float`,
`.ld-marquee`, `.ld-signal`) are independently disabled under
`@media (prefers-reduced-motion: reduce)` (`globals.css:3431`); the aurora is a
static gradient. `overflow-x: hidden` on `main.ld` plus a `max-w` section wrapper
yield **zero horizontal overflow at 375px** (measured: `main` width = 375.33px =
viewport). Focus rings are defined both globally (`globals.css:24`) and
`.ld`-scoped (`globals.css:3398`). Images use `next/image` with explicit
width/height (no CLS). Headings are semantic (single `h1`, sectioned `h2`/`h3`).
Hero content animates immediately (`animate`, not scroll-gated) so the LCP text is
never blank-gated on animation.

Two interactive controls were below the panel's ≥44px tap-target bar and are
**fixed in-pass**.

---

## Kill-question scorecard (EXPERT_PANEL.md §8)

| Kill-question | Verdict | Evidence |
|---|---|---|
| Layout shift / overflow at 375? Tap targets ≥44px? Focus rings visible? | **PASS (after fix)** | `main` measured 375.33px, `overflow-x:hidden`; tap targets fixed to 44px; focus-visible defined globally + `.ld`-scoped. |
| Motion respects `prefers-reduced-motion`; content not gated on animation? | **PASS** | framer via `MotionConfig reducedMotion="user"`; CSS animations disabled under reduced-motion media query; hero LCP text uses immediate `animate`. |
| Hero/product-window weight reasonable for LCP? | **PASS** | No raster hero — the "product window" is pure DOM/SVG; connector logos are small SVGs via `next/image`. No 1MB PNG. |
| Any "faded" text below AA on the dark canvas? | **PASS** | `.ld-text-fade` gradient floor kept legible (`#6a7180` min); muted/dim tokens are decorative, not body copy. |

---

## Fixes shipped in-pass

- **A-6.1** — Header "Start free" CTA was `min-h-[38px]` (`LandingPage.tsx:392`),
  6px under the bar. → `min-h-[44px]`. (Visible ≥640px, including touch tablets.)
- **A-6.2** — Mobile menu toggle was `h-10 w-10` = 40px (`LandingPage.tsx:403`) —
  the **primary mobile nav control**. → `h-11 w-11` (measured 44×44px live).
- **A-6.3** — Mobile overlay close button `h-10 w-10` → `h-11 w-11` for
  consistency with A-6.2.

All three are pure Tailwind height/width bumps on already-styled controls — no
layout reflow, fail-safe.

---

## Verified live (dev server, 375×812)

- `main.ld` → `overflow-x: hidden`, width `375.33px` (= viewport; no overflow).
- `[data-testid="nav-mobile-menu-toggle"]` → computed `44px × 44px`.
- `[data-testid="landing-header-cta"]` → `display:none` at 375 (correct; shows ≥640px).
- Console: **no errors**. Hero copy fully rendered (content not animation-gated).

> Note: `preview_screenshot` times out on this page because the infinite CSS
> ambient animations keep the renderer busy; `preview_inspect` confirms full paint
> and correct geometry, which is the load-bearing proof here.

---

## Not changed (observed, acceptable)

- `Reveal` uses `whileInView` with `initial="hidden"`; if JS fully fails the
  revealed sections stay at opacity 0. This is the standard framer pattern and the
  **LCP/above-the-fold hero is not Reveal-wrapped** (it animates immediately), so
  the critical content is safe. Promoting below-fold sections to a no-JS-visible
  baseline is a possible future hardening, not a Pass-6 blocker.
