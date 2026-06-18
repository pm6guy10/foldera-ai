# Foldera Design System & Quality Bar (BINDING)

This is the durable design truth for every visible Foldera surface (landing, dashboard, Slack card, emails). It encodes **what we DO want** so no one has to re-explain it. If a surface does not meet this bar, it is not done. `FOLDERA_MASTER_BIBLE.md` points here as the design authority.

> Owner direction (2026-06-17): "Every pass must be OBVIOUSLY better, not incremental. It should look like a $500M company — Linear / Vercel / Notion tier. Someone sees it and can't believe a small team made it. Smooth, clean, adaptive (great on desktop AND mobile), professional end to end."

---

## 1. The bar

- **Tier:** Linear, Vercel, Notion. World-class product marketing craft.
- **The test:** show it to a non-technical person → "no way you made this." Obvious, undeniable quality.
- **Feel:** smooth, calm, confident, dense-but-uncluttered, premium. Lead with the **product**, not marketing copy.
- **No micro-polish passes.** Changes are full, obvious leaps. If someone has to ask "what changed?", it failed.

## 2. Reference set — STUDY THESE BEFORE BUILDING

1. **Owner's AI Studio build** (the current favorite — warm/amber on near-black, a realistic full product mockup with a left sidebar (Today/Signals/State/Moves/…) and a "Launch approval is ready for sign-off" Right Now card with evidence rows, a full nav, a stats row, feature cards with icons, a horizontal How-it-works, an enterprise/trust strip, and a final email-capture CTA). This is the richness + polish target. Pull exact tokens/layout from it; the owner can re-share the AI Studio / Figma / Lovable source as starting material — **port from existing good material, do not reinvent from a blank page.**
2. **linear.app** — type, spacing, motion, restraint, product-led hero.
3. **vercel.com** — gradients, dark craft, real product/dashboard visuals.
4. **notion.so** — warmth, clarity, friendly density.

Use web search / open these and match the craft. Other owner assets to mine: Figma files, Lovable exports, Google Stitch.

## 3. Brand

- **Logo mark:** `public/foldera-glyph.svg`, always via `<FolderaMark />` (`components/nav/FolderaMark.tsx`). Never re-draw the mark inline.
- **Wordmark:** "Foldera", Inter, weight 600, tight tracking (-0.025em).
- **Accent:** match the approved AI Studio reference — a **warm signal accent (amber/gold direction)** on a near-black canvas. (The live repo previously used electric cyan `#22D3EE`; that was not the approved direction. Confirm the exact accent hue from the reference build / Figma before finalizing — but default warm, not cyan, unless the owner says otherwise.) One dominant accent only; use it sparingly and precisely.

## 4. Color tokens (dark canvas)

Encode as CSS variables in `app/globals.css` and Tailwind theme; never hard-code raw hex in components.

- Canvas: near-black, slightly warm (e.g. `#0A0A0C`–`#0E0F12`). Layer 2 surface a few % lighter.
- Text: high-contrast off-white primary (`#F5F6F8`), muted (`#9AA0AA`), dim (`#5A606B`).
- Borders/hairlines: very low-alpha white (`rgba(255,255,255,0.06–0.10)`).
- Accent (warm): a confident amber/gold for the single signal — used on the one primary action, the live "ready" state, and small highlights. Plus success-green and danger-red for status only.
- Depth comes from **layered surfaces + soft shadows + subtle gradient**, not neon glow.

## 5. Typography

- **Display/headings:** **Bricolage Grotesque** (loaded via `next/font`, CSS var `--font-display`, Tailwind `font-display`; applied to every `h1–h4`) — distinctive editorial-premium character at large sizes, tight tracking (-0.02 to -0.045em), confident leading (~1.0–1.1). _Owner decision 2026-06-17 (#382): a distinctive display face over plain Inter for the "designed/$500M" signal._
- **Body:** Inter (`--font-sans`, Tailwind `font-sans`), 16–18px, leading ~1.6, muted color.
- **Mono (labels/eyebrows/data):** JetBrains Mono (`--font-mono`, Tailwind `font-mono`) — uppercase, tracked (0.16–0.28em) for eyebrows; tabular for data.
- Scale (px / line-height): Display 56–72 / 1.0 · H1 40–48 / 1.05 · H2 30–36 / 1.1 · H3 20–24 / 1.2 · Body 16–18 / 1.6 · Caption 13 / 1.5 · Mono-label 11–12 / 1.4.
- Fluid with `clamp()` so it scales desktop→mobile.

## 6. Spacing & layout

- Scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Use it; no arbitrary gaps.
- Content max-width ~1140–1200px, generous gutters (24–32px).
- Section vertical rhythm: large and consistent (96–128px desktop, 64–80 mobile).
- Generous negative space. Density where it sells the product (the mockup), air everywhere else.

## 7. Radius / borders / shadows

- Radius: controls 8–10px (pills for primary CTAs are OK), cards 12–16px, product window 16px.
- Borders: 1px hairlines at low-alpha white. Avoid heavy/boxy outlines.
- Shadows: soft, large, low-opacity (e.g. `0 24px 48px -12px rgba(0,0,0,0.6)`); used for the product window and raised cards — not on everything.

## 8. Icons & logos — NON-NEGOTIABLE (this is where it has looked cheap)

- **Connector / brand logos (Gmail, Slack, Notion, Linear, Google Calendar, Microsoft/Outlook, GitHub, Google Drive):** use the **real, official, full-color brand SVGs.** Never hand-drawn / flat approximations. Source from official brand kits or a vetted set (e.g. simple-icons, or the brand's own SVG). Render at consistent size in consistent chips.
- **UI icons:** one consistent set (lucide-react is acceptable) at **consistent stroke (1.5–1.75px) and size (16–20px)** and the muted text color — never mixed weights/sizes.
- **Foldera mark:** `<FolderaMark />` only.
- If a logo asset is missing, add the real SVG to `public/logos/` — do not ship a flat stand-in.

## 9. Components

- **Nav:** logo + wordmark, 3–5 real links, a quiet secondary (Sign in/Login) and one accent primary (Request access / Book a demo). Sticky, translucent, blurred, hairline bottom border. Mobile: hamburger → clean sheet.
- **Buttons:** Primary (accent fill, dark text, subtle hover lift); Secondary (hairline/ghost); Tertiary (text + underline-on-hover); Icon (square, hairline). Min 44px tap height. Visible focus ring.
- **Cards:** Flat (hairline), Raised (soft shadow), Premium (subtle gradient surface + inner top highlight). Real depth, not flat boxes; not a uniform grid of identical boxes either.
- **The product visual (the centerpiece):** lead with a realistic product mockup — a window/app frame containing the Right Now state: a left rail (Today / Signals / State / Moves / …), the "Launch approval is ready for sign-off" card with check-marked evidence rows (real source logos) and one primary action. This is what makes it read as real software. Make it the hero's focal point, like Linear/Vercel.
- **Stats / social proof / enterprise strip:** a stats row (e.g. 9.4 hrs/wk, 2.7×, 31%, $37B+), a logo/trust strip, and an enterprise row (SOC 2, read-only, SSO/SCIM, data residency, audit logs) — these sell credibility.
- **Footer:** multi-column (Product / Solutions / Resources / Company), wordmark, legal row.

## 10. Motion (smooth, Linear-grade)

- One orchestrated page-load: staggered reveal of hero elements (opacity + small y), the product window easing in.
- Scroll-reveals on sections (once), gentle fade-up.
- Micro-interactions: button hover lift, card hover, the live "Right Now" dot pulse, evidence rows revealing.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Durations 0.5–0.85s. Tasteful, never bouncy/flashy.
- Honor `prefers-reduced-motion`. Use `framer-motion` (already a dep); client components only where motion is needed.

## 11. Responsive / adaptive (must be excellent on BOTH)

- Looks deliberately great at **1440** (desktop) AND **390/375** (mobile) — not "desktop shrunk."
- Fluid type (`clamp`), reflow grids to single column on mobile, product mockup scales/stacks gracefully.
- **Zero horizontal overflow** at 375/390 (the e2e checks this). Tap targets ≥ 44px. Sticky nav + smooth scroll behave on mobile.

## 12. Quality checklist (the "$500M" gate — all must pass)

- [ ] Hero leads with a realistic product visual, not just text.
- [ ] All brand/connector logos are real official SVGs; UI icons are one consistent set.
- [ ] Type scale + spacing scale used consistently; generous, intentional whitespace.
- [ ] Dominant accent used sparingly; depth from layering/shadow/gradient, not neon.
- [ ] Smooth orchestrated load + scroll motion; reduced-motion respected.
- [ ] Flawless at 1440 and 390; no horizontal overflow; ≥44px targets.
- [ ] Reads as a real shipped product, not a pitch deck or template.
- [ ] Obviously, undeniably better than the prior pass.

## 13. Anti-patterns (do NOT ship)

- Flat / hand-drawn / inconsistent icons or fake logo stand-ins.
- A uniform grid of identical bordered boxes ("blocky").
- Generic AI-startup neon-glow glass cards as the whole identity.
- Sparse text-only sections with no product visual.
- Desktop layout naively shrunk to mobile; horizontal overflow.
- Tiny incremental polish presented as a redesign.

---

**Enforcement:** the landing/UI proof gate (build, lint, `large-file-splits`, Playwright `public-routes` + `landing-hero-visual-qa` + `dashboard-navigation` + `authenticated-routes`) must stay green; preserve `data-testid`s and asserted copy (or update the e2e specs in the same PR when the approved design changes the content). Meeting the e2e is necessary, not sufficient — the checklist in §12 is the real bar.
