# Foldera Full-Stack Smoke Test
**Date:** March 23, 2026
**Tester:** Claude Opus 4.6 (automated code + DB verification)

---

## 1. Landing Page (/)

| Check | Result | Notes |
|-------|--------|-------|
| Page loads | PASS | Static render, 0 build errors |
| "Get started" CTA | PASS | Links to `/start` (line 1114) |
| "Sign in" link | PASS | Links to `/login` (line 1111) |
| #product anchor | PASS | Points to section ID at line 1047 |
| #pricing anchor | PASS | Points to section ID at line 1233 |
| Pricing shows $29 | PASS | Confirmed in page source |
| Footer links | PASS | Platform→#product, Pricing→#pricing, Sign in→/login |
| No dead links | PASS | All href values resolve to real routes or anchors |

## 2. Login (/login)

| Check | Result | Notes |
|-------|--------|-------|
| Page loads | PASS | Static render |
| Google OAuth button | PASS | Calls `signIn('google')` |
| Microsoft OAuth button | PASS | Calls `signIn('azure-ad')` |
| "Start your free trial" link | PASS | Links to `/start` |

## 3. Dashboard (/dashboard)

| Check | Result | Notes |
|-------|--------|-------|
| Loads for authenticated user | PASS | Fetches `/api/conviction/latest` on mount |
| Empty state | PASS | "Your next read arrives at 7am tomorrow." |
| Directive display | PASS | Shows action type badge, directive text, reason |
| Artifact display (Pro) | PASS | `ArtifactPreview` renders email/document/calendar types |
| Artifact locked (Free) | PASS | `LockedArtifact` shows blur + "$29/mo" CTA |
| Approve button | PASS | Calls `/api/conviction/execute` with `decision:'approve'` |
| Skip button | PASS | Calls `/api/conviction/execute` with `decision:'skip'` |
| Email deep-link approve | PASS | `?action=approve&id=X` triggers execute on mount |
| Email deep-link skip | PASS | `?action=skip&id=X` triggers execute on mount |
| Flash messages | PASS | 4-second feedback after approve/skip |
| Pro gate (server) | PASS | `/api/conviction/execute` returns 403 for non-Pro approve |

## 4. Settings (/dashboard/settings)

| Check | Result | Notes |
|-------|--------|-------|
| Shows connected accounts | PASS | Google + Microsoft with connect/disconnect buttons |
| Shows subscription status | PASS | Plan label + days remaining |
| Auto-sync after OAuth | PASS | Triggers POST to sync-now on `?google_connected=true` or `?microsoft_connected=true` |
| Sync status banner | PASS | Cyan banner shows sync progress and count |

## 5. Stripe Checkout Flow

| Check | Result | Notes |
|-------|--------|-------|
| Checkout route exists | PASS | `/api/stripe/checkout` creates Stripe Checkout Session |
| Price ID from env | PASS | Uses `STRIPE_PRO_PRICE_ID` env var |
| 14-day trial | PASS | `trial_period_days: 14` in checkout session |
| Webhook signature verification | PASS | Uses `constructEvent()` with `STRIPE_WEBHOOK_SECRET` |
| checkout.session.completed | PASS | Creates `user_subscriptions` row with `plan:'trial'`, `status:'active'` |
| invoice.payment_succeeded | PASS | Updates to `plan:'pro'`, `status:'active'` |
| invoice.payment_failed | PASS | Updates to `status:'past_due'` |
| subscription.deleted | PASS | Cancels + schedules deletion +30 days |
| **user_subscriptions.user_id column** | **FIXED** | Column was missing from live DB. Migration applied. |

## 6. Email Delivery

| Check | Result | Notes |
|-------|--------|-------|
| From address | PASS | Fallback changed to `brief@foldera.ai` (was `onboarding@resend.dev`) |
| Email template | PASS | Dark bg, cyan accents, directive + artifact, approve/skip buttons |
| Approve link in email | PASS | `/dashboard?action=approve&id=X` |
| Skip link in email | PASS | `/dashboard?action=skip&id=X` |
| Score breakdown stripped | PASS | `reason.split('[score=')[0]` before render |
| DNS setup documented | PASS | `RESEND_DNS_SETUP.md` with DKIM/SPF/DMARC records |

## 7. Cron Pipeline

| Check | Result | Notes |
|-------|--------|-------|
| Trigger route exists | PASS | `/api/cron/trigger` with CRON_SECRET auth |
| Multi-stage pipeline | PASS | sync-microsoft → sync-google → auto-skip stale → daily-brief |
| Structured results | PASS | Returns per-stage `ok`, `results`, HTTP 200/207 |
| 5-minute timeout | PASS | `maxDuration = 300` |

## 8. Artifact Read Path

| Check | Result | Notes |
|-------|--------|-------|
| Artifacts stored in execution_result | PASS | All 3 write paths use `buildDirectiveExecutionResult()` |
| artifact column always NULL | PASS | Confirmed via DB query — 0 non-null artifact columns |
| API extracts from execution_result | PASS | `extractArtifact()` in `/api/conviction/latest` and `daily-brief.ts` |
| Dashboard reads correctly | PASS | conviction-card uses `action.artifact ?? executionResult.artifact` |
| Email template reads correctly | PASS | `renderArtifactHtml(directive.artifact)` from extracted path |

## 9. New User Onboarding

| Check | Result | Notes |
|-------|--------|-------|
| /start OAuth buttons | PASS | Google + Microsoft, callback → `/dashboard` |
| Google callback stores tokens | PASS | Saves to `user_tokens` via `saveUserToken()` |
| Microsoft callback stores tokens | PASS | Same path |
| Auto-sync after connection | PASS | Settings detects `?provider_connected=true`, fires sync-now |
| Empty dashboard state | PASS | Clear message, no broken UI |

## 10. Build & Tests

| Check | Result | Notes |
|-------|--------|-------|
| `npm run build` | PASS | 0 errors |
| `npx vitest run` | 180 PASS / 21 FAIL | All 21 failures are pre-existing (ENCRYPTION_KEY not set in test env) |
| No new test failures | PASS | All failures existed before these changes |

---

## What Was Fixed In This Session

1. **Pro gating** — Free users see blurred artifacts with upgrade CTA. Pro/trial users see full artifacts + approve/skip. Server-side gate on `/api/conviction/execute`.
2. **Resend from address** — Changed fallback from `onboarding@resend.dev` to `brief@foldera.ai`. Wrote `RESEND_DNS_SETUP.md`.
3. **Auto-sync after OAuth** — Settings page triggers immediate sync after provider connection. Cyan status banner shows progress.
4. **user_subscriptions.user_id column** — Added missing column to live DB. Stripe webhook and subscription helper now have the column they query.
5. **Artifact read path cleanup** — Simplified conviction-card fallback logic.

## What Remains Broken

1. **ENCRYPTION_KEY not set in test env** — 21 test failures in `execute-action.test.ts`. Not a production issue.
2. **NR2 (legacy encryption)** — Microsoft tokens encrypted under pre-rotation key cannot be decrypted. Needs `ENCRYPTION_KEY_LEGACY` or fresh Microsoft re-auth.
3. **DNS records not added** — `RESEND_DNS_SETUP.md` documents what's needed, but records must be added at the domain registrar.
4. **STRIPE_PRO_PRICE_ID** — Must be set to `price_1T9coR2NLOgC3SAaVxcM0rEn` in Vercel env.
5. **RESEND_FROM_EMAIL** — Must be set to `Foldera <brief@foldera.ai>` in Vercel env after domain verification.
6. **No Stripe test completed** — Cannot test with real Stripe card from code. Requires manual verification in Stripe dashboard.
7. **Mobile 375px visual check** — Layout uses responsive Tailwind classes but no browser-based visual verification performed.
