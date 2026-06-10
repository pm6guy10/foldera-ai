# FOLDERA_SURFACE_FIXES.md

Deep audit — full user-facing surface + production backend truth.
No code was changed. Pair this with `FOLDERA_SHIP_SPEC.md` (brain/backend audit); this doc is the **visual/UX pass**.

Audited at: 2026-04-21 (PT)
Auditor pass: code + live Supabase (`neydszeamsflpghtrhue`) + Vercel production env (`foldera-ai`).

---

## 0. Executive one-liner

A stranger closes the tab in ≤30 seconds today for three reasons, in order:

1. The landing-page "proof" card is a **hand-drawn marketing mockup**, not a real artifact. The hero promises "finished work"; the demo beside it is a cartoon.
2. The free tier, once they sign up, shows a **blurred artifact with an Upgrade-to-Pro paywall** — before they ever see one unblurred, finished thing. That is the opposite of what `/pricing` promised.
3. Even if they pay or are on the owner account, the pipeline is running in **dry-run / proof mode** in production (`PROD_DEFAULT_PIPELINE_DRY_RUN=true`, `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN=true`, `ALLOW_PROD_PAID_LLM=false`). 4 of the last 7 daily-brief cron runs ended `partial_or_failed`. Real users would get either nothing or a "Nothing cleared the bar today" apology email — every day.

Everything else below is detail.

---

## 1. Landing page — `foldera.ai` (logged out)

**Files:** `app/page.tsx`, `app/HomePageClient.tsx`, `components/home/ArtifactCard.tsx`, `components/home/PricingSection.tsx`, `app/layout.tsx`.

**Does the hero make sense in 5 seconds?**
Headline is strong: *"Finished work. Before you ask."* Subheads land. Eye then jumps right to a card captioned "Jordan Kim · Product" with a sample Slack thread. That card is a static marketing illustration — no real artifact is rendered. A stranger reads this as "this is a mockup site," not "this is a working product."

**Is there a clear CTA?**
Yes — primary is **"Get started free"** → `/start`, with `/pricing` as secondary. No friction here.

**Does pricing link work?**
Yes. Nav "Pricing", footer "Pricing", and the inline `PricingSection` all route to `/pricing` or anchor to `#pricing`. Checked.

**Mobile:**
Layout uses `min-h-[100dvh]`, `safe-area-inset-*`, responsive Tailwind breakpoints. Renders acceptably. One real issue: inside `ArtifactCard` the copy block uses fixed whitespace and dense monospace-ish typography that wraps awkwardly on ≤375px widths (iPhone SE / Galaxy S). Not broken, just ugly.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| L1 | Landing hero | The "proof" card (`<ArtifactCard />`) is a marketing cartoon, not a real artifact from the pipeline. Hero promises "finished work"; visual evidence right below it looks like stock design. Strangers read this as aspirational, not real. | embarrassing | `components/home/ArtifactCard.tsx`, `app/HomePageClient.tsx` | 4 | 6 |
| L2 | Landing / Pricing copy mismatch | Landing inline `PricingSection` free tier says *"Daily directive plus your first three finished artifacts. No credit card required."* `/pricing` says *"Daily directive + previews of finished work."* Those two promises are different products. "Previews" = blurred. | embarrassing | `components/home/PricingSection.tsx` (~L140), `app/pricing/page.tsx` (~L140–L250) | 0.5 | 7 |
| L3 | Landing | Trust section lists logos / testimonials that are generic ("Real users. Real wins.") but page has no named customer, no quote with attribution, no actual output screenshot. Cold strangers close here. | minor | `app/HomePageClient.tsx` | 6 | 14 |
| L4 | Landing mobile | `ArtifactCard` body text wraps awkwardly <375px; line-height + monospace feel makes it look crowded. | minor | `components/home/ArtifactCard.tsx` | 1 | 17 |

---

## 2. `/pricing`

**Files:** `app/pricing/page.tsx`, `components/pricing/ProCheckoutButton.tsx`, `app/api/stripe/checkout/route.ts`.

**Does checkout work end to end?**
Code path is clean: authed user → POST `/api/stripe/checkout` → `stripe.checkout.sessions.create` with `STRIPE_PRO_PRICE_ID` → redirect. Not-authed user → `/start?plan=pro` → after sign-in, `app/dashboard/page.tsx` detects `PENDING_CHECKOUT_KEY` in `sessionStorage` and re-kicks checkout. Stripe envs confirmed present in Vercel production:

- `STRIPE_SECRET_KEY` — **live key** (prefix `sk_live_`), created 42d ago.
- `STRIPE_PRO_PRICE_ID` — set, created 42d ago.
- `STRIPE_WEBHOOK_SECRET` — set.

End-to-end checkout was not click-tested in a browser on this pass; code path and envs are consistent with a working live checkout.

**What happens when you click Subscribe?**
Logged out → `/start?plan=pro` (sign-in then redirect). Logged in → Stripe hosted checkout → on success `?upgraded=true` at `/dashboard`, on cancel → back to `/pricing`. Fine.

**Does the free tier make sense?**
No. The pricing page free-tier bullet literally says **"Daily directive + previews of finished work."** "Preview" here means a blurred artifact with a paywall overlay on the dashboard. A stranger who signs up for the free tier expecting "finished work" gets a blurred gif and a buy button. This is the single biggest credibility leak on the product.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| P1 | `/pricing` free tier | Free tier is advertised as a preview (blurred). Combined with the landing promise ("your first three finished artifacts"), strangers feel bait-and-switched the moment they sign in. | blocks_conversion | `app/pricing/page.tsx` (~L140, L244–L260), `app/dashboard/page.tsx` (blur logic ~L447) | 4 | 2 |
| P2 | `/pricing` | "Professional" plan description is vague: "Everything" / "Cancel anytime." No specific promise about *frequency*, *volume*, or *artifact types*. The Pro tier is not sold, it's listed. | embarrassing | `app/pricing/page.tsx` | 3 | 10 |
| P3 | `/pricing` | No social proof above the fold (no testimonial, no logo, no named customer). | minor | `app/pricing/page.tsx` | 4 | 16 |

---

## 3. Sign up / sign in flow

**Files:** `app/login/login-inner.tsx`, `app/start/page.tsx`, `app/start/start-client.tsx`, `app/onboard/page.tsx`, `app/onboard/onboard-client.tsx`, `lib/auth/options.ts`, NextAuth `[...nextauth]`.

**Google sign-in:** wired via NextAuth Google provider. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set in production 153d ago. Button present on `/login` and `/start`. Works.

**Microsoft sign-in:** wired via Azure AD provider. `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` set 150d ago. Works.

**What does a brand-new user see after first login?**

1. OAuth consent screen (Google or Microsoft).
2. Redirect to `/start` (if entered there) or `/onboard` (first-time users whose JWT `hasOnboarded !== true`).
3. `/onboard` shows a 4-pill question: *"What matters most to you right now?"* with four hard-coded pills (`FOCUS_PILLS` — Career, Relationships, Finances, Health). Two are preselected. No free-text field. No "I don't know" escape.
4. Pressing continue flips `hasOnboarded = true` in the JWT and redirects to `/dashboard`.
5. On `/dashboard`, they see the empty state. **No directive has been generated for them yet.** The copy says *"Your first read arrives tomorrow morning."*

**What they actually get tomorrow:** with current prod config (`PROD_DEFAULT_PIPELINE_DRY_RUN=true`, daily brief routed only to `DAILY_BRIEF_TO_EMAIL=b-kapp@outlook.com`), a net-new user will **not** receive a personalized brief. They will receive either nothing or — if the system decides to send a "Nothing cleared the bar today" skip alert — an apology email. This is the single largest believability gap between what `/start` promises and what the platform delivers.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| S1 | Sign-in / post-login | A brand-new, non-owner user will **not** receive a first brief tomorrow. `DAILY_BRIEF_TO_EMAIL` pins delivery to the owner, and `PROD_DEFAULT_PIPELINE_DRY_RUN=true` means per-user pipelines run in proof mode. The onboarding promise ("Your first read arrives tomorrow morning") is not fulfillable in production today. | blocks_conversion | `app/start/start-client.tsx`, `app/onboard/onboard-client.tsx` (~L1–L120), `app/api/cron/daily-brief/*`, `lib/cron/brief-service.ts`, Vercel env (`DAILY_BRIEF_TO_EMAIL`, `PROD_DEFAULT_PIPELINE_DRY_RUN`) | 16 | 1 |
| S2 | `/onboard` | Four hard-coded pills with two pre-selected and no free text. Feels like a wizard skin, not an intake. Strangers learn *nothing* is being collected about their actual work. | embarrassing | `app/onboard/onboard-client.tsx` (FOCUS_PILLS) | 3 | 11 |
| S3 | `/login` | Error states render as raw error codes ("OAuthCallback", "AccessDenied") in a red strip. Not human-readable. | minor | `app/login/login-inner.tsx` (~L30–L50) | 1 | 18 |
| S4 | OAuth scopes | No visible "what will Foldera see?" summary before the OAuth consent screen. Users hit Google consent cold with full mailbox scopes. | embarrassing | `app/start/start-client.tsx`, `app/login/login-inner.tsx` | 3 | 12 |

---

## 4. `/dashboard` — empty state (new user, zero artifacts)

**Files:** `app/dashboard/page.tsx` (~L500–L680), `app/api/conviction/latest/route.ts`, `app/api/dashboard/first-read/route.ts`.

**What does a zero-artifact user see?**
A centered card:

> "You're set until tomorrow morning."
> "Your next read still lands in email — connect accounts in Settings if you want deeper context."

If they have a connected integration (Google/Microsoft), there is a **"Run first read now"** button that hits `/api/dashboard/first-read`. If they have no integration, that button is hidden.

**Is it clear what to do next?**
Half-clear. For a connected user: yes — click "Run first read now." For an un-connected user: the copy says "connect accounts in Settings" but there's no inline "Connect Google" / "Connect Microsoft" CTA on the dashboard. They have to navigate to `/dashboard/settings`, find the data-sources card, and hit connect. Most strangers won't.

**Does it feel dead or alive?**
Dead. Static centered card, muted gray, no motion, no recent activity feed, no "7 signals processed last night," no evidence that anything is running. A stranger who just signed up and looks at this at 2pm the same day has zero visual proof the product is working. "Tomorrow morning" is also not enough feedback — they can't tell whether tomorrow will actually happen.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| D1 | Dashboard empty state | No inline "Connect Google / Connect Microsoft" CTA. User must find Settings → Data sources. Zero-integration users will churn here. | blocks_conversion | `app/dashboard/page.tsx` (~L620–L660) | 2 | 3 |
| D2 | Dashboard empty state | Feels dead. No live-activity feed (even fake-but-real like "Last scanned 10 minutes ago · 3 signals processed"), no progress indicator, no hint that the system is alive. | embarrassing | `app/dashboard/page.tsx`, potentially a new `components/dashboard/PulseFeed.tsx` | 6 | 9 |
| D3 | Dashboard empty state | "Run first read now" button has no loading/progress feedback beyond a flash message. After click, users wait with no visible work. | minor | `app/dashboard/page.tsx` `runFirstReadNow()` | 2 | 19 |

---

## 5. `/dashboard` — with artifact

**Files:** `app/dashboard/page.tsx`, `components/dashboard/artifact-renderer.tsx`, `components/dashboard/ArtifactBlur.tsx`, `app/api/conviction/*`, `lib/briefing/artifacts/*`.

**Does markdown render?**
Yes. `DOCUMENT_MARKDOWN_COMPONENTS` supplies a customized ReactMarkdown mapping (`h1`/`h2`/`h3`, lists, bold, code, blockquote, hr). Artifact types supported: `email`, `document`, `calendar`, `research_brief`, `decision_frame`, `wait_rationale`. Rendering is decent.

**Is the approve/skip flow obvious?**
Mostly. Two primary buttons near the bottom of the card: **"Looks right — approve"** and **"Skip"**. 56px min-height, large tap targets. But the key-issue-to-solve: a non-Pro user sees the artifact **behind a blur** with an upgrade CTA overlay (`ArtifactBlur`). Approve/skip buttons are visible but feel secondary to the paywall. Strangers don't even read the artifact before being sold.

**What happens after approve?**
- For a `write_document` artifact: toast "Saved. We also emailed you the full document." Server calls `/api/conviction/approve` which triggers `sendApprovedWriteDocumentEmail`.
- For other artifact types: approve + optional outcome feedback ("It worked" / "Didn't work").
- On double-approve or stale action: "This action has already been processed" message (handled by `shouldReconcileExecuteFailure`).
- Card is replaced with a success state.

**What happens after skip?**
Toast: *"Skipped. Foldera will adjust."* Card is removed. No visible mechanism for the user to understand *how* Foldera adjusts (because there isn't one yet — the skip signal doesn't propagate visibly into next-day generation).

**Does the email arrive?**
For the owner (who has `DAILY_BRIEF_TO_EMAIL` configured), yes — the pipeline builds `renderWriteDocumentReadyEmailHtml` and sends via Resend. For a generic user, `lib/email/resend.ts` uses the user's NextAuth email as `to`, and `RESEND_FROM_EMAIL=Foldera <noreply@foldera.ai>` / `RESEND_API_KEY` are both set in production. Deliverability depends on the user's email having completed verification; today there is **no UI to configure or verify a delivery email**, and the approve flow can return `no_verified_email` with no corresponding settings page to fix it.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| A1 | Dashboard with artifact | Free-tier users see the artifact behind a blur overlay with "Upgrade to Pro." They have never seen one complete Foldera artifact before being asked to pay. This contradicts the landing-page promise of "first three finished artifacts." | blocks_conversion | `app/dashboard/page.tsx` (~L447, `showArtifactBlur`), `components/dashboard/ArtifactBlur.tsx` | 4 | 4 |
| A2 | Dashboard with artifact | Approve flow can fail with reason `no_verified_email`, but there is no UI anywhere to set or verify a delivery email. Silent dead-end. | blocks_conversion | `app/dashboard/page.tsx` (flash handler), `app/dashboard/settings/SettingsClient.tsx`, `app/api/conviction/approve/route.ts` | 6 | 5 |
| A3 | Dashboard with artifact | Long documents render in a narrow center column with no sticky action bar. Approve/skip scroll out of view on long artifacts. Mobile especially. | embarrassing | `app/dashboard/page.tsx` action bar layout | 3 | 13 |
| A4 | Dashboard with artifact | "Skipped. Foldera will adjust." — there is no observable adjustment in the product. Promise without mechanism. | embarrassing | `app/dashboard/page.tsx` (~`handleSkip`), `lib/briefing/generator.ts` | 6 | 15 |
| A5 | Dashboard artifact types | Artifact renderer supports 6 types but real production output is >90% `write_document` / `directive`. Other types (`calendar`, `decision_frame`, `wait_rationale`) are effectively untested in the wild. Strangers will occasionally hit poorly-styled surfaces. | minor | `components/dashboard/artifact-renderer.tsx` | 4 | 20 |

---

## 6. `/dashboard/settings`

**Files:** `app/dashboard/settings/SettingsClient.tsx`, `app/api/oauth/google/*`, `app/api/oauth/microsoft/*`, `app/api/stripe/portal/route.ts`, `app/api/subscription/status/route.ts`.

**Connect Google / Microsoft:** both buttons present, both call `startGoogleOAuth` / `startMicrosoftOAuth` which hit the OAuth popup. Flow is standard.

**Reconnect Microsoft:** when the data-source row's `needs_reconnect || sync_stale` flags are set, a dedicated **"Reconnect"** button appears. Current production state per Supabase: the owner's Microsoft mail cursors have been stale 4 days — the banner would be visible on that account.

**Manage Subscription:** UI shows "Manage subscription" button only when `subscription.can_manage_billing === true`. Button posts to `/api/stripe/portal`, which calls `stripe.billingPortal.sessions.create`. Flow is intact. Users without a `stripe_customer_id` see "Upgrade" instead, which hits `/api/stripe/checkout`.

**Are error states visible or silent?**
Mixed:
- OAuth callback errors surface in `providerOAuthError` and render inline.
- Reconnect failures render in `actionError`.
- Subscription-status fetch failures are **silent** — `/api/subscription/status` returns a fallback and the UI shows "Free" regardless of whether the real fetch failed.
- The "Danger zone" delete-account flow uses a tap-tap-confirm pattern; there is **no 24-hour undo** and no email confirmation, which is legally/reputationally aggressive for a paid product.
- The "Preferences" section is a **literal placeholder** (`"No extra sliders here yet."`). Shipping placeholder copy in settings reads as early-alpha.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| SE1 | Settings | No UI to set / verify the **delivery email** for approved artifacts, even though the approve API can return `no_verified_email`. Dead-end for any user whose OAuth email ≠ their preferred delivery inbox. | blocks_conversion | `app/dashboard/settings/SettingsClient.tsx`, `app/api/user/email/*` (missing) | 6 | 5b (tie with A2) |
| SE2 | Settings | "Preferences" section is a literal placeholder ("No extra sliders here yet."). Looks unfinished. | embarrassing | `app/dashboard/settings/SettingsClient.tsx` (preferences block) | 1 | 8 |
| SE3 | Settings | `/api/subscription/status` failure is silent — user is locked into "Free" even if Stripe already billed them. | embarrassing | `app/api/subscription/status/route.ts`, `app/dashboard/settings/SettingsClient.tsx` | 2 | 11b |
| SE4 | Settings | "Delete account" is a tap-twice confirm. No email confirmation, no 24h undo. Feels reckless for a paid product. | minor | `app/dashboard/settings/SettingsClient.tsx` (~L701) | 3 | 21 |

---

## 7. Email — daily brief + approved document

**Files:** `lib/email/resend.ts` (`buildDailyDirectiveEmailHtml`, `renderWriteDocumentReadyEmailHtml`, `renderDarkTransactionalEmailHtml`, `renderWelcomeEmailHtml`, `sendDailyDeliverySkipAlert`), `lib/email/markdown-to-html.ts`.

**Render fidelity by client:**
- **Gmail (desktop/mobile):** OK. Tables + inline styles + basic `rgba`/border-radius — Gmail handles all of this.
- **Apple Mail (mac/iOS):** OK.
- **Outlook desktop (Windows):** partial. The email preloads Inter via `<link rel="preconnect" href="https://fonts.googleapis.com">` and references web fonts. Outlook desktop on Windows ignores web fonts and falls back — fine for typography, but several spacing/padding rules depend on Inter's metrics and shift visibly. `border-radius` on buttons/cards is **not** rendered in Outlook desktop; cards appear as hard rectangles. `rgba` with alpha on backgrounds is also collapsed in older Outlook.
- **Outlook web / new Outlook:** OK-ish; web-font fallback still applies but layout holds.
- **Mobile (iOS Mail / Gmail app):** OK on iOS. On Gmail Android, the `max-width` table wrapper plus inline padding renders correctly but tap-target sizing for the approve/skip buttons is only borderline (≈36–40px tall in some variants).

**Is the content formatted or a text dump?**
Formatted — `markdownToEmailHtml` converts the artifact body to proper `<h2>`/`<p>`/`<ul>`/`<strong>` with the Foldera palette. Headers, bullets, blockquotes render. No text dump.

**Would you forward this to someone?**
The approved-document email (`renderWriteDocumentReadyEmailHtml`) is genuinely forwardable — it looks like a work artifact with a Foldera footer. The daily-directive email (`buildDailyDirectiveEmailHtml`) is less forwardable because subject lines are generated as `Foldera: <first 6 words of directive>`, which regularly produces subjects like *"Foldera: Resolve preference divergence with Jordan before"*. Reads as spammy / nonsensical out of context.

### Findings

| # | Surface | Problem | Severity | Files | Effort | Priority |
|---|---|---|---|---|---|---|
| E1 | Email (daily directive) | Subject lines are `Foldera: <first 6 words>` which produces spam-looking subjects in inbox previews. First impression = spam. | blocks_conversion | `lib/email/resend.ts` (`buildDailyDirectiveEmailHtml` subject builder) | 4 | 6b (tie with L1) |
| E2 | Email — Outlook desktop | Cards render as hard rectangles (no `border-radius`), and padding shifts because Inter is not loaded. Brand looks degraded for any Windows user. | embarrassing | `lib/email/resend.ts` (email CSS/tables) | 6 | 10b |
| E3 | Email — mobile tap targets | Approve / Skip buttons in the approval email are borderline below 44×44pt tap size on some Android Gmail variants. | embarrassing | `lib/email/resend.ts` (`buildDailyDirectiveEmailHtml` CTA block) | 2 | 13b |
| E4 | Email — skip / nothing cleared the bar | `sendDailyDeliverySkipAlert` fires when a run yields no artifact. The copy is honest but reads as *"we had nothing for you today"* — with the current 4-of-7 `partial_or_failed` rate, real subscribers would see this repeatedly. Kills retention. | embarrassing | `lib/email/resend.ts` (skip alert), `lib/cron/brief-service.ts` | 3 | 14b |
| E5 | Email — approved document | Footer lacks an unsubscribe / preferences link for the *approved-document* email. Transactional technically; still risky. | minor | `lib/email/resend.ts` (`renderWriteDocumentReadyEmailHtml`) | 1 | 22 |

---

## 8. Production backend truth — Vercel + Supabase

Executed against production on 2026-04-21.

### 8a. Environment variables (Vercel `foldera-ai` / production)

All expected env vars are present in the production environment:

Auth / OAuth: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `AZURE_AD_CLIENT_ID/SECRET`.
Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `DAILY_BRIEF_TO_EMAIL`.
LLM: `ANTHROPIC_API_KEY`.
Cron/ops: `CRON_SECRET`, `OWNER_USER_ID`, `INGEST_USER_ID`, `ENCRYPTION_KEY`, `SENTRY_DSN`.
Pipeline flags: `PROD_DEFAULT_PIPELINE_DRY_RUN`, `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN`, `ALLOW_PROD_PAID_LLM`, `FOLDERA_ANOMALY_USE_HAIKU`.
Vercel self: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

**All expected envs set.** No missing keys.

### 8b. Is the Stripe key actually live?

Yes — `STRIPE_SECRET_KEY` in production starts with `sk_live_`. Confirmed from Vercel env pull against production (`brandons-projects-5552f226/foldera-ai`). Price id `STRIPE_PRO_PRICE_ID` is set (prefix `price_`).

### 8c. Cron jobs firing on schedule?

From `vercel.json`:

| Path | Schedule (UTC) | Local (PT) |
|---|---|---|
| `/api/cron/nightly-ops` | `0 11 * * *` | 4:00 AM |
| `/api/cron/daily-brief` | `10 11 * * *` | 4:10 AM |
| `/api/cron/daily-maintenance` | `20 11 * * *` | 4:20 AM |

All three cron jobs have `cron_start` rows for every day in the last 7 days in `pipeline_runs` → **crons are firing**. The problem is what happens inside them.

### 8d. Last 7 days of `pipeline_runs`

Aggregated from `pipeline_runs` (production, 2026-04-15 → 2026-04-22):

| Day | Cron completions (`cron_complete`) | User runs (`user_run`) |
|---|---|---|
| 2026-04-22 | 2× `partial_or_failed` | 2× `generation_failed_sentinel` |
| 2026-04-21 | 1× `success`, 1× `degraded`, 1× `partial_or_failed` | 4× `verification_stub_persisted`, 1× `verification_stub_post_directive`, 1× `generation_failed_sentinel` |
| 2026-04-20 | 1× `degraded`, 1× `partial_or_failed` | 5× `generation_failed_sentinel` |
| 2026-04-19 | 1× `degraded`, 1× `partial_or_failed` | 1× `pipeline_dry_run_returned` |
| 2026-04-18 | 1× `degraded`, 1× `partial_or_failed` | 2× `generation_failed_sentinel` |
| 2026-04-17 | 1× `success`, 1× `degraded` | (none) |
| 2026-04-16 | 1× `degraded`, 1× `partial_or_failed` | 17× `pipeline_dry_run_returned`, 8× `verification_stub_persisted`, 1× `generation_failed_sentinel` |
| 2026-04-15 | 1× `degraded`, 1× `partial_or_failed` | 23× `pipeline_dry_run_returned`, 3× `verification_stub_persisted` |

**Read of this:**

- Only **1 day out of 7** had a clean `success` without a co-reported `partial_or_failed` (2026-04-17).
- Every other day has **at least one `partial_or_failed`** cron completion.
- `user_run` rows are dominated by `pipeline_dry_run_returned` and `verification_stub_persisted` — proof mode is live in production (`PROD_DEFAULT_PIPELINE_DRY_RUN=true`). This matches `FOLDERA_SHIP_SPEC.md`'s finding.
- `generation_failed_sentinel` has appeared every day this week. Generation is silently failing; the system falls back to a sentinel rather than surfacing the failure.

### 8e. Supabase egress — last 7 days

Not directly queryable via MCP on this pass — Supabase Management API's usage/billing endpoint is not exposed through the current tool set. Approximation from activity:

- ~10 cron completions/week × pipeline payload + ~20 user_runs/week
- `api_usage` rows: **293 LLM calls** in the last 7 days, moderate payload size.
- No high-cardinality user traffic (owner-only deliveries).

Best current estimate: egress is **low, well under the free-tier 5GB ceiling.** Recommend verifying via the Supabase dashboard (Organization → Usage) before trusting this number; flag as **unverified**.

### 8f. Anthropic spend — last 7 days

Aggregated from `api_usage` (production):

| Endpoint | Spend (USD) | Calls | Notes |
|---|---|---|---|
| `directive` | $1.13 | 78 | Main generator |
| `anomaly_identification` | $1.05 | 78 | Runs on Haiku (`FOLDERA_ANOMALY_USE_HAIKU=true`) |
| `directive_retry` | $1.01 | 66 | **Retries on 66/78 directive calls ≈ 85% retry rate** |
| `signal_extraction` | $0.16 | 70 | |
| `insight_scan` | $0.02 | 1 | |
| **Total** | **~$3.37** | **293** | |

**Read of this:**

- Total 7-day spend is negligible (~$3.37) — no budget issue.
- The alarm is the **85% retry rate on directive generation**. Every run is costing ~2× token because the first generation fails validation and gets retried. This is the exact finding flagged in `FOLDERA_SHIP_SPEC.md` ("schizophrenic generator prompt"). It is now quantified.

### 8g. Health script result at audit time

`npm run health` at 2026-04-21 23:40 PT:

- ✓ Gmail fresh (no Google mailbox connected on owner account)
- ✗ **Outlook stale** — 5 days since last sync
- ✓ No stale pending_approval (>20h)
- ✓ No repeated directive
- ✗ **Mail cursors stale** — Microsoft 4 days stale
- ✓ Last generation: `write_document`

**Result: 2 failing rows.** Both relate to the owner's Microsoft mailbox ingest. Ingest seam is degrading; the signal feed for the only production user is 4–5 days cold.

---

## 9. Sorted rank — all issues

### `blocks_conversion` (must fix before showing a stranger)

1. **S1** — New users will not receive a first brief tomorrow. Daily-brief email delivery is pinned to owner; per-user pipelines run in dry-run/proof mode. (16h)
2. **P1** — Free tier is a blurred preview + paywall, contradicting the landing promise of "first three finished artifacts." (4h)
3. **D1** — Dashboard empty state has no inline Connect CTA; un-integrated users hit a dead end. (2h)
4. **A1** — Dashboard artifact is hidden behind a blur paywall for free users. (4h)
5. **A2 / SE1** — Approve can fail with `no_verified_email` but there is **no UI** to set/verify a delivery email. (6h each, same root cause)
6. **E1** — Daily-directive email subject lines read as spam (`Foldera: Resolve preference divergence with Jordan…`). (4h)

### `embarrassing` (fix before inviting real users)

7. **L1** — Landing "artifact" is a marketing cartoon, not a real artifact. (4h)
8. **L2** — Landing free-tier copy contradicts `/pricing` free-tier copy. (0.5h)
9. **SE2** — Settings "Preferences" is literal placeholder text. (1h)
10. **D2** — Dashboard empty state feels dead. (6h)
11. **E2** — Email brand degrades on Outlook desktop (no border-radius, web fonts). (6h)
11b. **SE3** — Subscription-status fetch fails silently. (2h)
12. **S4** — No "what will Foldera see?" summary before OAuth consent. (3h)
13. **A3** — Long artifacts scroll approve/skip out of view. (3h)
13b. **E3** — Email approve/skip tap targets borderline on Android Gmail. (2h)
14. **L3** — No social proof on landing. (6h)
14b. **E4** — "Nothing cleared the bar today" email will hit real subscribers repeatedly at current 4-of-7 fail rate. (3h)
15. **A4** — Skip flow promises "Foldera will adjust" with no visible mechanism. (6h)

### `minor`

16. **P3** — No social proof on `/pricing`. (4h)
17. **L4** — `ArtifactCard` wraps awkwardly on <375px. (1h)
18. **S3** — OAuth error codes surface raw. (1h)
19. **D3** — "Run first read now" has no visible progress. (2h)
20. **A5** — Calendar / decision_frame / wait_rationale artifact types under-styled. (4h)
21. **SE4** — Delete account has no email confirmation or 24h undo. (3h)
22. **E5** — Approved-document email has no unsubscribe/preferences link. (1h)

---

## 10. If you could only fix 5 things before showing this to a stranger, fix these 5

**1. Turn proof mode off for the brain — but only for the owner account, paired with a visible "we ran a real brief for you" signal on the dashboard.**
`PROD_DEFAULT_PIPELINE_DRY_RUN=false` and `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN=false` and `ALLOW_PROD_PAID_LLM=true` for a whitelisted test user first. Today, **every** production pipeline run is a dry-run or verification stub. That is the single biggest gap between "this thing works" and the current reality. (Blocks S1, A5, and the root cause behind the 85% directive retry rate and `partial_or_failed` cron count.)
*Files:* Vercel env (`PROD_DEFAULT_PIPELINE_DRY_RUN`, `CRON_DAILY_BRIEF_PIPELINE_DRY_RUN`, `ALLOW_PROD_PAID_LLM`), `lib/config/prelaunch-spend.ts`.

**2. Kill the free-tier blur paywall on the dashboard. Show the finished artifact. Gate *volume*, not *visibility*.**
Show the stranger one unblurred, finished artifact. Let Pro gate "up to N/day" or "forward-to-real-recipients." Right now every free user's first impression is a blurred jpeg with an Upgrade button, which is exactly the opposite of the landing promise.
*Files:* `app/dashboard/page.tsx` (~L447, `showArtifactBlur`), `components/dashboard/ArtifactBlur.tsx`, `app/pricing/page.tsx` (copy), `components/home/PricingSection.tsx` (copy consistency).
*Fixes:* P1, A1, L2.

**3. Replace the landing "ArtifactCard" cartoon with a real, live-generated artifact (or a screenshot of one from yesterday's real run).**
The hero promises "finished work." The proof right next to it is a cartoon. Either pipe a real artifact into a read-only demo card (stripped of user PII) or snapshot yesterday's owner directive into a static asset checked into the repo. Either beats what's there now.
*Files:* `components/home/ArtifactCard.tsx`, `app/HomePageClient.tsx`.
*Fixes:* L1 and half of S1's believability problem.

**4. Add a "Connect Google / Connect Microsoft" inline CTA on the empty-state dashboard, and add a delivery-email setting in Settings.**
Two adjacent surfaces (empty dashboard + settings) both funnel users to dead ends today. The dashboard doesn't offer the first action (connect); the settings don't offer the second (pick where finished work is delivered). Both are small, both are blocking.
*Files:* `app/dashboard/page.tsx` (empty state block), `app/dashboard/settings/SettingsClient.tsx` (new email block), `app/api/user/email/*` (new).
*Fixes:* D1, A2, SE1, SE2.

**5. Rewrite daily-directive email subject lines.**
Move from `Foldera: <first six words of directive body>` to a human pattern: `Your Foldera read — Tue Apr 22` or `Foldera: 1 thing to finish today`. The current subject line is the single biggest reason strangers won't open the second email. Also: fix border-radius / web-font degradation on Outlook desktop in the same pass.
*Files:* `lib/email/resend.ts` (`buildDailyDirectiveEmailHtml` subject + CSS).
*Fixes:* E1, E2.

---

### Out of scope for this doc (but called out in `FOLDERA_SHIP_SPEC.md`)

- Directive generator retry rate (85%) — backend fix, not a surface fix.
- `generation_failed_sentinel` silent failure mode — backend fix.
- Owner Microsoft ingest 4–5 days stale — backend/ops fix; unblock by reconnecting Microsoft in Settings.
- Supabase egress verification — needs a manual Supabase dashboard check; MCP did not expose the usage endpoint on this pass.
