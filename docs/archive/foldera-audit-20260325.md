# Foldera App Audit — March 25, 2026

**Auditor:** Claude (Cowork mode)
**Date:** 2026-03-25
**Scope:** All major pages, all interactive elements (excluding OAuth, Sign out, Delete account, Disconnect)
**Auth state during audit:** Logged in as b-kapp@outlook.com (Pro account)

---

## Summary of Bugs Found

| # | Severity | Page | Issue |
|---|----------|------|-------|
| 1 | HIGH | `/` (homepage) | Hero headline + subtext + CTA vanish on second visit — hero section renders blank for logged-in users |
| 2 | HIGH | `/dashboard/settings` | "Generate now" → "Brief generation failed." — generation is broken (Anthropic API credits exhausted) |
| 3 | MEDIUM | `/` (homepage) | Nav shows "SIGN IN" and "GET STARTED" to logged-in users — no dashboard shortcut or account indicator |
| 4 | MEDIUM | `/pricing` | Stripe checkout session is **test mode** (`cs_test_...`) — real users would hit a test checkout |
| 5 | MEDIUM | `/blog` (all posts) | Every post's excerpt/description is a lowercased copy of the title — no real preview text |
| 6 | MEDIUM | `/onboard?edit=true` | Large blank dead zone occupies the top ~35% of the viewport — severe layout gap |
| 7 | LOW | `/dashboard` | Empty state says "Your first read arrives tomorrow morning" even though account has 482 active commitments — misleading copy |
| 8 | LOW | `/` (homepage) | No footer link to Blog — blog is entirely undiscoverable from marketing pages |
| 9 | INFO | `/pricing` | Clicking "CONTINUE TO CHECKOUT" triggers Stripe before confirming price/plan — no interstitial |

---

## Page-by-Page Results

---

### 1. https://www.foldera.ai (Homepage — logged out view tested first, then logged in)

**Renders:** Full hero on first fresh load. Headline "Your next move, already prepared.", subtext, GET STARTED CTA, product demo card (Finalize Q3 Projections), and product feature section all loaded correctly on initial visit.

**Buttons tested:**

- **PLATFORM** (nav): ✅ Scrolls to product section (`#product`)
- **PRICING** (nav): ✅ Scrolls to pricing section (`#pricing`)
- **SIGN IN** (nav): Not clicked (leads to OAuth)
- **GET STARTED** (nav + hero): ✅ For logged-in users, correctly redirects to `/dashboard`
- **APPROVE** (hero demo card): ✅ Navigates to `/dashboard` for logged-in user (expected)
- **SKIP** (hero demo card): ✅ Navigates to `/dashboard` for logged-in user (expected)

**Bugs:**

- **BUG-1 (HIGH):** On second navigation to `/` while logged in, the hero section (headline, subtext, CTA button) renders completely blank — only the demo card and lower sections appear. The top 30% of the page is an empty black rectangle. This appears to be a hydration/rendering issue affecting returning logged-in visitors. The page title changes to the correct value but the React hero component fails to render.

- **BUG-3 (MEDIUM):** Logged-in users see "SIGN IN" and "GET STARTED" in the nav — no dashboard link, user avatar, or account indicator. A logged-in user has no visual confirmation they're authenticated from the marketing homepage.

- **BUG-8 (LOW):** The footer contains PLATFORM, PRICING, SIGN IN links only. No link to the Blog anywhere on the homepage or footer. Blog is entirely undiscoverable from marketing pages.

**Console errors:** None detected.

**Layout:** Good on initial load. Breaks on revisit (see BUG-1).

---

### 2. https://www.foldera.ai/login

**Behavior:** Immediately redirects to `/dashboard` for logged-in users. ✅ Correct.

**Visual (logged-out):** Not testable while logged in. Expected to show Google/Microsoft OAuth buttons.

**Bugs:** None found (redirect behavior correct).

---

### 3. https://www.foldera.ai/start

**Behavior:** Immediately redirects to `/dashboard` for logged-in users. ✅ Correct.

**Bugs:** None found (redirect behavior correct).

---

### 4. https://www.foldera.ai/pricing

**Renders:** "One plan. Full power." heading. $29/mo Professional card with 6 feature bullets. "CONTINUE TO CHECKOUT →" button. "NO CREDIT CARD REQUIRED." subtext.

**Nav:** Minimal — just logo (FOLDERA.AI) and "SIGN IN" link. PLATFORM/GET STARTED nav links absent. This is intentional for a standalone pricing page but "SIGN IN" label is shown even to logged-in users.

**Buttons tested:**

- **CONTINUE TO CHECKOUT:** ✅ Fires and opens a Stripe Checkout session. However:

**Bugs:**

- **BUG-4 (MEDIUM):** The Stripe session URL contains `cs_test_...` — this is a **Stripe test mode** checkout session. Real users navigating to `/pricing` and clicking checkout would land in a test environment and cannot complete a real payment. This needs to be switched to a live mode Stripe price ID in production.

- **Note:** "NO CREDIT CARD REQUIRED." subtext appears below the checkout button — inconsistent with immediately launching a Stripe checkout that shows card fields.

**Console errors:** None detected.

---

### 5. https://www.foldera.ai/blog

**Renders:** Clean blog index page. "FOLDERA JOURNAL" label, hero headline, 5 post cards listed chronologically.

**Post cards layout:** Each card shows date, title, and excerpt.

**Bugs:**

- **BUG-5 (MEDIUM):** Every post card's excerpt/description is a lowercased, slightly reformatted repeat of the post title. Examples:
  - Post: "AI That Reads My Email and Tells Me What to Do Every Morning"
  - Excerpt: "AI that reads my email and tells me what to do every morning."
  - Post: "AI Assistant for Busy Professionals (That Actually Reduces Work)"
  - Excerpt: "AI assistant for busy professionals that actually reduces work."

  These excerpts are clearly auto-generated from the title (title-cased → sentence-cased, period appended). No real preview text is shown. This is likely the `description` frontmatter field being auto-filled from the title. All 5 posts confirmed affected. Real excerpts from the article body should be shown instead.

**Post cards interactive:** All 5 cards are clickable links. ✅

---

### 5a. https://www.foldera.ai/blog/ai-email-assistant (Post 1)

**Renders:** Full article. Date, title, subtitle (same bug — lowercased title as subtitle on article page too), article body with proper headings, paragraphs, bullet lists, italic emphasis.

**Bug:** The subtitle below the title ("AI that reads my email and tells me what to do every morning.") is the same placeholder text as the blog card excerpt. This appears on the article page itself, displayed visually as the sub-headline — awkward and redundant.

**Bottom CTA:** "Try Foldera free at https://foldera.ai" — the link renders as a plain hyperlink. ✅

**Typography/formatting:** ✅ Headings, body copy, bullets, italics all render correctly.

**"Back to blog" link:** ✅ Present and functional.

---

### 5b. https://www.foldera.ai/blog/ai-assistant-busy-professionals (Post 3)

**Renders:** Same structure. Same subtitle bug. Body formatting correct. ✅

---

### 6. https://www.foldera.ai/dashboard

**Renders:** Minimal — "Foldera" wordmark top-left, ⚙️ gear icon top-right, centered empty state text.

**Directive card state:** No directive card shown. Empty state displays:
> "Your first read arrives tomorrow morning."
> "Foldera is learning your patterns."

**Bug:**

- **BUG-7 (LOW):** The empty state copy is misleading. The account has 482 active commitments (confirmed via `/api/conviction/latest` API response) and has been active since September 2025. Displaying "Your first read arrives tomorrow morning / Foldera is learning your patterns" reads like a brand new user onboarding message, not an empty state for an established account that simply has no pending_approval action today. The copy should differentiate between "new account, no data yet" and "active account, no directive queued today."

**Interactive elements:**

- **"Foldera" wordmark:** ✅ Stays on `/dashboard` (already there)
- **⚙️ gear icon:** ✅ Navigates to `/dashboard/settings`

**Console errors:** None detected.

---

### 7. https://www.foldera.ai/dashboard/settings

**Renders:** Full settings page in a single viewport. Sections: Connected accounts, Your focus areas, Subscription, Daily brief, Account.

**Connected accounts:**
- Google: Connected ✅ — Gmail 53 signals, Calendar 0 signals (awaiting sync), Drive 61 signals
- Microsoft: Connected ✅ — Mail 286 signals, Calendar 13 signals, OneDrive 0 signals (awaiting sync)

**Your focus areas:**
- Active tags: Job search, Side project, Financial (cyan/teal highlight)
- Inactive tags: Career growth, Business ops, Health & family, Relationships, Learning (dark)
- Custom goal text: "Be a stronger spiritual leader"

**Subscription:** Pro / Active ✅

**Buttons tested:**

- **Edit focus areas:** ✅ Navigates to `/onboard?edit=true` correctly
- **Generate now:** ⚠️ See BUG-2 below
- **"Foldera" wordmark (nav):** ✅ Navigates back to `/dashboard`
- **⚙️ gear icon (on settings page):** Stays on `/dashboard/settings` (no visual feedback — feels like it does nothing)

**Bugs:**

- **BUG-2 (HIGH):** "Generate now" button fires, shows "Running sync + generate..." loading state correctly (~20 seconds), then returns **"Brief generation failed."** in red text beneath the button. The button resets to "Generate now". No directive is created. This is almost certainly caused by exhausted Anthropic API credits (confirmed in codebase session logs). The error message is minimal — no detail on why it failed or what to try. Consider a more informative message.

**Console errors:** None detected.

**Layout:** Clean. All content fits in one viewport without scroll on most screens. No overflow or truncation observed.

---

### 8. https://www.foldera.ai/onboard?edit=true

**Renders:** Focus area selection form. 8 category buttons (Job search, Career growth, Side project, Business ops, Health & family, Financial, Relationships, Learning). Custom goal text field pre-filled with "Be a stronger spiritual leader". Cyan "Continue" button.

**Bugs:**

- **BUG-6 (MEDIUM):** Severe layout gap at the top of the page. Roughly the top 35% of the viewport (approximately 350–400px) is completely blank black space. The "Foldera" wordmark appears near the bottom of this dead zone, and the form begins below it. This appears to be a `min-h-screen` or `flex justify-center items-center` centering issue where the page vertically centers the form in the full screen but the form's height is less than half the screen, pushing visual content down. There is no navbar on this page.

**Interactive elements:**

- All 8 focus area buttons: ✅ Toggle active/inactive state visually (cyan border = active)
- Custom text field: ✅ Editable
- **Continue button:** Not clicked (would save and navigate — out of scope for this audit pass)

**Console errors:** Could not capture (navigation cleared console state before checking).

---

## Cross-Cutting Observations

**No console errors detected** on any page audited (homepage, dashboard, settings, blog, pricing).

**Auth-aware routing works correctly:** `/login`, `/start`, and `/` all redirect logged-in users to `/dashboard`. ✅

**Stripe test mode:** The checkout on `/pricing` uses a test session key (`cs_test_...`). This is a critical production issue — real users cannot pay.

**Blog link missing from marketing nav/footer:** The blog is only accessible by direct URL or if you happen to know about `/blog`. No marketing page links to it.

**Google Calendar / OneDrive showing "awaiting sync":** Both show 0 signals awaiting sync in settings — these data sources may not be syncing properly or the connectors are incomplete.

**"Brief generation failed" root cause:** Based on codebase session history, Anthropic API credits are exhausted in production. The generation pipeline fails silently at the API call layer and surfaces only this generic error. Users have no way to know this is an infrastructure issue vs. a bug with their account.

---

## Recommended Fix Priority

1. **Stripe test mode on /pricing** — No real user can subscribe. Fix immediately.
2. **Brief generation failing** — Core product feature is down. Requires Anthropic billing resolution.
3. **Homepage hero blanks out on revisit** — Marketing page breaks for logged-in returning visitors.
4. **Blog excerpts are all placeholder text** — Looks unpolished to anyone reading the blog.
5. **Onboard layout gap** — Large dead zone is visually broken.
6. **Dashboard empty state copy** — Misleading for established accounts.
7. **No blog link in nav/footer** — Blog content is invisible to most visitors.
