# Foldera Design System & Quality Bar (BINDING)

This is the durable design truth for every visible Foldera surface (landing, dashboard, Slack card, emails). It encodes **what we DO want** so no one has to re-explain it. If a surface does not meet this bar, it is not done. `FOLDERA_MASTER_BIBLE.md` points here as the design authority.

> Owner direction (2026-06-17): "Every pass must be OBVIOUSLY better, not incremental. It should look like a $500M company — Linear / Vercel / Notion tier. Someone sees it and can't believe a small team made it. Smooth, clean, adaptive (great on desktop AND mobile), professional end to end."

---

## 1. The bar

- **Tier:** Linear, Vercel, Notion. World-class product marketing craft.
- **The test:** show it to a non-technical person → "no way you made this." Obvious, undeniable quality.
- **Feel:** smooth, calm, confident, premium. Lead with the **product**, not marketing copy.
- **No micro-polish passes.** Changes are full, obvious leaps. If someone has to ask "what changed?", it failed.

### 1a. Art direction — SHOW, DON'T TELL (owner direction 2026-06-18, BINDING)

> "Better contrast/hierarchy. Less words, more images and blank space. Show don't tell — if I don't even speak English I should get it. Not all lines and borders. Open-concept flow with some division, but don't overdo it."

- **Show, don't tell.** A non-English-speaker should understand the page from visuals alone: the product window, real logos, icons-as-meaning, simple diagrams, motion. Words support the image, never replace it.
- **Less words.** Ruthlessly cut copy. One strong line beats a paragraph. Headline + one supporting clause, not headline + 3-sentence body. Delete eyebrow/label clutter where the layout already says it.
- **More blank space.** Generous, confident negative space is the default. Big section rhythm (≥128px desktop). When unsure, add air.
- **Fewer lines & borders.** Do NOT divide everything with hairlines/`border-t`/`divide-y`. Separate with **space and subtle surface tint**, not rules. At most a few intentional hairlines per page. No uniform bordered-box grids.
- **Open-concept flow.** Sections breathe into each other; light division only (a tint shift, a soft gradient seam) — never heavy boxing. But still legible structure: don't make it one undifferentiated wash.
- **Stronger contrast & hierarchy.** Bigger jumps between levels — display headings larger and brighter (`text-primary`), secondary text dimmer (`text-muted`), accent on fewer elements so it punches. The eye should land in an obvious order.

## 2. Reference set — STUDY THESE BEFORE BUILDING

1. **Owner's AI Studio build** (the current favorite — warm/amber on near-black, a realistic full product mockup with a left sidebar (Today/Signals/State/Moves/…) and a "Launch approval is ready for sign-off" Right Now card with evidence rows, a full nav, a stats row, feature cards with icons, a horizontal How-it-works, an enterprise/trust strip, and a final email-capture CTA). This is the richness + polish target. Pull exact tokens/layout from it; the owner can re-share the AI Studio / Figma / Lovable source as starting material — **port from existing good material, do not reinvent from a blank page.**
2. **linear.app** — type, spacing, motion, restraint, product-led hero.
3. **vercel.com** — gradients, dark craft, real product/dashboard visuals.
4. **notion.so** — warmth, clarity, friendly density.

Use web search / open these and match the craft. Other owner assets to mine: Figma files, Lovable exports, Google Stitch.

## 3. Brand

- **Logo mark:** `public/foldera-glyph.svg`, always via `<FolderaMark />` (`components/nav/FolderaMark.tsx`). Never re-draw the mark inline.
- **Wordmark:** "Foldera", Inter, weight 600, tight tracking (-0.025em).
- **Accent:** **CONFIRMED amber/gold `#F5A623`** (hover `#FFC25C`, deep `#B4760F`) on a warm near-black canvas — owner-approved 2026-06-17 (#378/#382), app-wide. The electric-cyan `#22D3EE` era is fully retired. One dominant accent only; use it sparingly and precisely (the one primary action, the live "ready" state, small highlights).

## 4. Color tokens (dark canvas) — IMPLEMENTED (#382)

Token-driven; never hard-code raw hex in components. Two coordinated layers, both warm-amber:

**A. App-wide Tailwind tokens** (`tailwind.config.js` → use as `bg-bg`, `bg-panel`, `text-text-primary`, `text-accent`, `border-border`, etc.):

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0A0C` | page canvas (warm near-black) |
| `panel` | `#131318` | card / panel surface |
| `panel-raised` | `#1A1B21` | elevated panel, hover |
| `border` / `border-subtle` / `border-strong` | `#26262D` / `#191920` / `#34343D` | hairlines → prominent |
| `text-primary` / `text-secondary` / `text-muted` | `#F5F6F8` / `#C8CCD4` / `#9AA0AA` | headings → body → dim |
| `accent` / `accent-hover` / `accent-dim` | `#F5A623` / `#FFC25C` / `#B4760F` | the single signal |
| `success` | `#34D399` | status only |

**B. Landing `.ld` layer** (`app/globals.css`, `--ld-*` CSS vars) mirrors the same palette for the marketing surface (`--ld-bg #0A0A0C`, `--ld-accent #F5A623`, `--ld-fg #F5F6F8`, hairlines `rgba(255,255,255,0.07–0.11)`). **C. `/demo`** uses `app/demo/demo.css` oklch tokens tuned to the same warm-amber hue (~70–75) / warm neutrals (~70).

- Depth comes from **layered surfaces + soft shadows + subtle amber gradient**, not neon glow. Atmosphere = a faint amber aurora upper-right (`.ld-aurora` / `.foldera-app-surface`), never a blue/cyan wash.

## 5. Typography

- **Display/headings:** **Bricolage Grotesque** (loaded via `next/font`, CSS var `--font-display`, Tailwind `font-display`; applied to every `h1–h4`) — distinctive editorial-premium character at large sizes, tight tracking (-0.02 to -0.045em), confident leading (~1.0–1.1). _Owner decision 2026-06-17 (#382): a distinctive display face over plain Inter for the "designed/$500M" signal._
- **Body:** Inter (`--font-sans`, Tailwind `font-sans`), 16–18px, leading ~1.6, muted color.
- **Mono (labels/eyebrows/data):** JetBrains Mono (`--font-mono`, Tailwind `font-mono`) — uppercase, tracked (0.16–0.28em) for eyebrows; tabular for data.
- Scale (px / line-height): Display 56–72 / 1.0 · H1 40–48 / 1.05 · H2 30–36 / 1.1 · H3 20–24 / 1.2 · Body 16–18 / 1.6 · Caption 13 / 1.5 · Mono-label 11–12 / 1.4.
- **Fluid `clamp()` tokens (IMPLEMENTED, `app/globals.css :root`):** `--fs-display: clamp(2.6rem,1.55rem+4.6vw,4.5rem)` · `--fs-h1: clamp(2.1rem,1.55rem+2.5vw,3rem)` · `--fs-h2: clamp(1.6rem,1.28rem+1.5vw,2.25rem)` · `--fs-h3: clamp(1.25rem,1.12rem+0.6vw,1.5rem)` · `--fs-body: clamp(1rem,0.97rem+0.15vw,1.125rem)` · `--fs-caption: 0.8125rem` · `--fs-mono-label: 0.6875rem`. Scales desktop→mobile with no breakpoints.
- **Visual hierarchy (one ladder, everywhere):** mono amber eyebrow (uppercase, tracked) → display heading (Bricolage, tight) → secondary fade/dim sub-line → body (Inter, `text-secondary`) → mono caption/label. Numerals (stats, prices) use the display face for character.

## 6. Spacing & layout

- Scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Use it; no arbitrary gaps.
- Content max-width ~1140–1200px, generous gutters (24–32px).
- Section vertical rhythm: large and consistent (96–128px desktop, 64–80 mobile).
- Generous negative space. Density where it sells the product (the mockup), air everywhere else.

## 7. Radius / borders / shadows

- Radius: controls 8–10px (pills for primary CTAs are OK), cards 12–16px, product window 16px.
- Borders: 1px hairlines at low-alpha white. Avoid heavy/boxy outlines.
- Shadows: soft, large, low-opacity; used for the product window and raised cards — not on everything.
- **Tokens (IMPLEMENTED, `app/globals.css :root`):** radius `--r-control: 10px` · `--r-card: 14px` · `--r-window: 16px` · `--r-pill: 9999px`. Shadow `--shadow-card` (flat raised) · `--shadow-raised` (`0 24px 60px -28px rgba(0,0,0,.7)`) · `--shadow-window` (product window: inner top highlight + deep drop). Premium card = subtle amber gradient surface + 1px amber-alpha border + inner top hairline highlight + `--shadow-window` (see `/pricing` Pro card, landing product window).

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
- **Tokens (IMPLEMENTED, `app/globals.css :root`):** `--ease-out: cubic-bezier(0.16,1,0.3,1)` · `--dur-1: 0.5s` · `--dur-2: 0.65s` · `--dur-3: 0.85s`. Under `prefers-reduced-motion` the durations collapse to `0.01ms` (content stays visible — never gate base visibility on JS).
- Honor `prefers-reduced-motion` (`framer-motion` + `<MotionConfig reducedMotion="user">`); client components only where motion is needed. Standard hero pattern: `stagger` parent + `fadeUp` children (`opacity:0,y:20 → opacity:1,y:0`).

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
- Hard-coded `cyan-*` / blue hex (retired) or raw hex in components — use the tokens (§4).
- Gating base content visibility on JS motion (use the `stagger`/`fadeUp` pattern, but content must remain readable if rAF is throttled / reduced-motion).

## 14. Implementation status — whole-app overhaul (epic #382)

Where the system lives: tokens in `app/globals.css :root` (type scale, radius, shadow, motion) + `.ld` landing vars; Tailwind tokens in `tailwind.config.js`; demo theme in `app/demo/demo.css`; fonts in `app/layout.js` via `next/font`. Shared chrome: `components/nav/NavPublic.tsx` (header) + `components/nav/BlogFooter.tsx` (premium multi-column footer, used by every public page).

Phased delivery (each a reviewed PR merged to live):
- **Phase 1 — DONE & LIVE** (PR #383): app-wide amber cohesion + Bricolage/Inter/JetBrains type system + design tokens.
- **Phase 2a — DONE & LIVE** (PR #384): premium shared site footer across all public pages.
- **Phase 3 (in progress):** marketing-funnel craft — `/pricing` rebuilt (premium Recommended card, depth, motion, trust + enterprise row); `/start`, `/login`, `/try`, `/security`, `/about` next.
- **Phase 4:** content & legal pages. **Phase 5:** product (`/demo` + `/dashboard/*`).

Reference exemplars in-repo: the landing hero product window and `/pricing` Pro card are the canonical "premium card + depth + motion" patterns to copy.

---

**Enforcement:** the landing/UI proof gate (build, lint, `large-file-splits`, Playwright `public-routes` + `landing-hero-visual-qa` + `dashboard-navigation` + `authenticated-routes`) must stay green; preserve `data-testid`s and asserted copy (or update the e2e specs in the same PR when the approved design changes the content). Meeting the e2e is necessary, not sufficient — the checklist in §12 is the real bar.
