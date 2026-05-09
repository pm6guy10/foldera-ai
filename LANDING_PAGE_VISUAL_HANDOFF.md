# LANDING_PAGE_VISUAL_HANDOFF

## Purpose

This file is the production handoff for the next homepage implementation seam.

The source direction is image-first, not Figma-layer-first. The implementation agent should use the approved high-fidelity mockup look and the existing Foldera visual system to build a real responsive homepage with React and Tailwind.

## Direction Source

Primary visual references:

- `artifacts/visual-pass/home-desktop-1440.png`
- `artifacts/visual-pass/home-mobile-390.png`
- `components/foldera/LandingPage.tsx`

These references define the look, composition, atmosphere, and proof-object priority.

They do **not** define editable layers, exact absolute coordinates, or a requirement to reconstruct the page from Figma extraction.

## Final Visual Direction

- Dark SaaS landing page with a premium black-to-deep-navy base.
- Neon Foldera glow should stay in the cyan / electric blue / magenta family, used as controlled atmosphere and edge emphasis rather than noisy wallpaper.
- Large desktop hero and large mobile hero are required. The hero must feel like the center of gravity on both breakpoints.
- The **Daily Brief** is the primary proof object. It should be the first concrete product artifact a visitor understands, not a secondary card hidden under generic marketing copy.
- Trust framing must stay production-safe and truthful: source-backed, approval-controlled, and narrow. The page should feel credible without pretending the product already supports capabilities it does not have.

## Implementation Rule

The mockup image is **direction**, not editable source of truth.

Implementation agents must:

- Build the homepage with real responsive React and Tailwind components.
- Treat the image references as composition and visual-priority guidance.
- Preserve truthful Foldera framing instead of recreating screenshot artifacts literally.
- Keep the build narrow and production-safe.

Implementation agents must **not**:

- Depend on Figma layer extraction as the implementation source of truth.
- Add fake customer logos.
- Add fake metrics, fake usage counts, or fake enterprise proof.
- Add unsupported broad integrations or “everything connects” claims.
- Expand the homepage into a long, overbuilt SaaS page unless the product actually has the supporting capabilities and proof.

## Homepage Sections

### 1. Hero

The hero should explain Foldera in one read:

- strong headline
- one short support paragraph
- primary CTA
- immediate visual proof of the product

Desktop direction:

- two-part composition with copy on one side and the Daily Brief proof object dominating the other side
- visible ambient glow behind or around the proof object
- restrained nav chrome above

Mobile direction:

- large readable headline
- strong CTA without crowding
- supporting proof card or proof snippet visible early
- no collapsed, cramped, or hard-to-scan stack

### 2. Daily Brief Proof Card

The Daily Brief is the main product evidence.

It should communicate:

- Foldera found the high-leverage move
- the move is already drafted or prepared
- the user still owns approval

The card should read like a finished product object, not a decorative dashboard screenshot.

### 3. Source-Check / Artifact / Approval Explanation

The page should quickly explain the operating loop:

1. Foldera checks connected sources.
2. Foldera produces the artifact when the signal is strong.
3. The user approves, skips, or holds.

This section should stay short, visual, and concrete. No giant process diagram, no bloated feature grid, and no vague AI productivity language.

### 4. Protected Product Promise

The promise must stay narrow and true:

- source-backed
- one useful finished move
- no outbound by default
- approval stays with the user
- honest holdback when evidence is weak

If trust language is added, it must stay inside current product truth:

- Gmail and Microsoft first
- source trail
- approve / skip / save
- no false enterprise or compliance signaling

### 5. CTA and Footer

The page should close with one clear action:

- start free
- connect a source
- see how Foldera works

The footer should stay lightweight and product-consistent. It should support the conversion path without turning into a feature cemetery.

## Non-Negotiable Implementation Constraints

- Daily Brief stays the primary proof object.
- The page must look premium without inventing proof.
- The implementation must feel like Foldera, not a generic startup template.
- The visual hierarchy must stay obvious on first glance.
- Keep the page short enough that every section earns its place.

## QA Gates

Implementation is not ready until all of these are true:

- No text overlap on desktop or mobile.
- Mobile remains readable at `390px`.
- Desktop hero explains the product in under 10 seconds.
- The Daily Brief proof object is visually dominant above the fold.
- No fake logos, fake metrics, or unsupported integrations appear.
- `npm run health` passes.
- `npm run controller:autopilot` still prints a real `CONTROLLER RESULT`.

## Handoff Summary

Build from the image direction, not from layer extraction.

The finished homepage should feel like:

- dark
- premium
- neon Foldera
- Daily Brief first
- truthful
- short
- production-safe

If a future implementation has to choose between “looks like the mockup” and “stays truthful to the real Foldera product,” truth wins.
