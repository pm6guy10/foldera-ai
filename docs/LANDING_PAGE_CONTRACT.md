# LANDING PAGE CONTRACT

## Authority

Control issue: #121 — Landing page frontend contract + code-native LP repair.

Product doctrine source: issue #48.

This contract controls the public landing page at `/` until issue #121 is closed or superseded by a later repo-backed issue.

## Purpose

The landing page must explain Foldera as a Workday Presence Layer, not as a generic AI assistant, inbox triage product, dashboard, task manager, or chatbot.

Its job is to make a serious operator understand four things quickly:

1. The workday collapses context across messages, meetings, files, blockers, and approvals.
2. Foldera keeps that work state attached.
3. Foldera triggers one Right Now move when the signal is strong.
4. The current pilot is consented, limited, and safe: no screen-reading, no surveillance, no auto-send, and no fake enterprise claims.

## Target buyer and user

Primary user: overloaded founders, operators, PMs, researchers, and professionals who repeatedly lose context across tools and need one next move returned at the right time.

Primary buyer frame: a serious operator evaluating whether Foldera can reduce context collapse without adding another dashboard to manage.

## One-sentence promise

Foldera keeps the state of work attached across apps, meetings, files, blockers, and approvals so the next move comes back ready to review.

## Required story order

1. **Context collapse** — The day should not reset every time the user changes tools.
2. **Presence layer** — Foldera remembers the current focus, next move, blocker, waiting-on, and last completed step.
3. **One intervention** — When the signal is strong, Foldera returns one Right Now move.
4. **One-click response** — The user can mark Done, Stuck, Break smaller, or Snooze.
5. **Trust boundary** — No screen-reading, no surveillance, no automatic sending, no fake live integrations.
6. **Pilot CTA** — Header, hero, and final CTA route to `/start`.

## Allowed claims

- Foldera is a Workday Presence Layer.
- Foldera keeps work state attached across messages, meetings, files, blockers, and approvals.
- Foldera can prepare or return one next move when evidence is strong.
- The pilot uses consented sources and explicit user state.
- Slack/Teams/cross-app execution may be referenced only as not live or as test-mode/proof when that is repo-proven.
- The user remains in control of approval, skip, snooze, and hold-back decisions.

## Forbidden claims

- No SOC 2, HIPAA, enterprise-ready, or compliance certification claims unless separately proven and source-backed.
- No claim that Slack, Teams, email writeback, or automatic sending is live unless a controlling issue and proof say so.
- No screen-reading.
- No surveillance framing.
- No fake customer logos, fake testimonials, fake metrics, fake pricing, or fake integrations.
- No generic “AI productivity platform,” “AI agent workspace,” “task manager,” “inbox summary,” or “dashboard replacement” positioning.

## Visual standard

The page should preserve the dark premium editorial direction while becoming code-native:

- real HTML text for primary copy
- real buttons and anchors
- cinematic dark background
- restrained cyan/violet glow accents
- strong hero hierarchy
- one central Right Now card
- connector/state visuals that support the doctrine rather than replacing it
- mobile-first spacing that does not create horizontal overflow
- desktop layout that looks intentional, not like stretched phone posters

## Code-native requirements

Primary content must be React/Tailwind HTML, not screenshot text.

Static images may be used only as supporting visual assets or decorative references. They must not carry the main page copy, CTA meaning, or accessibility surface.

Required interactive elements:

- header CTA to `/start`
- hero CTA to `/start`
- final CTA to `/start`
- visible trust boundary copy
- visible Right Now card

## CTA route rules

- Header CTA routes to `/start`.
- Hero CTA routes to `/start`.
- Final CTA routes to `/start`.
- Anonymous users must not be dumped directly into `/dashboard`.
- `/start` remains the pilot/auth start boundary unless a later route-contract issue changes it.

## Accessibility and SEO minimums

- One visible `<h1>` that names the Foldera promise.
- Descriptive headings in story order.
- Buttons/links use real text.
- Color contrast must remain readable on dark backgrounds.
- The landing page must expose real semantic text to crawlers and assistive technology.
- No hidden screenshot-only marketing copy as the primary content surface.

## Proof gates

Required proof for issue #121 PR:

- `npm run gate:continuity`
- `npm run lint`
- `npm run build`
- landing route `/` loads
- `/start` route loads
- header, hero, and final CTAs route to `/start`
- mobile screenshot or equivalent Playwright proof
- desktop screenshot or equivalent Playwright proof
- no horizontal overflow at mobile width
- grep or test proof that unsupported enterprise/SOC2/HIPAA claims were not introduced
- GitHub receipt before stop

## Stop condition

Issue #121 is done when Foldera has:

1. this contract committed,
2. a code-native landing page at `/`,
3. `/start` CTA proof,
4. mobile and desktop rendering proof,
5. no backend/auth/Supabase/Stripe/Slack/dashboard changes,
6. no unsupported claims, and
7. a terminal GitHub receipt.
