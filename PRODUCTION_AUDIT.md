# PRODUCTION_AUDIT

## Build

- `npm run build` succeeded on March 16, 2026.
- Build warnings: none.

## Confirmed Clean Checks

- `TODO` / `FIXME` comments: none found in `app/`, `components/dashboard/`, or `lib/briefing/`.
- Deleted-file route references: none found via build validation and route/reference scan.

## Findings

1. Severity: critical  
   Path: `app/api/resend/webhook/route.ts:99`  
   Issue: The webhook inserts `tkg_signals.content` as plain text (`Daily brief opened on ...`) instead of encrypting it. This violates the app’s AES-256-GCM requirement for all signal content and will break any code path that assumes `tkg_signals.content` is decryptable.  
   Proposed fix: Encrypt webhook-generated signal content with `encrypt()` before insert, and apply the same rule to every `tkg_signals` write in the route.

2. Severity: critical  
   Path: `app/api/google/callback/route.ts:31`  
   Issue: The callback stores Google tokens under `process.env.INGEST_USER_ID ?? session.user.id`. In production `INGEST_USER_ID` is configured, so every connected user’s Google tokens are written to the ingest/owner account instead of the authenticated account.  
   Proposed fix: Always use `session.user.id` for user-owned OAuth callbacks; reserve `INGEST_USER_ID` for explicit cron or owner-only flows.

3. Severity: critical  
   Path: `app/api/microsoft/sync-now/route.ts:15`  
   Issue: Manual Microsoft sync runs against `process.env.INGEST_USER_ID ?? session.user.id`, so a signed-in user can trigger sync work against the owner account when `INGEST_USER_ID` is set.  
   Proposed fix: Use `session.user.id` for user-initiated syncs and keep `INGEST_USER_ID` out of session-backed routes.

4. Severity: critical  
   Path: `app/api/priorities/update/route.ts:29`  
   Issue: Priority writes use `process.env.INGEST_USER_ID ?? session.user.id`, which sends one user’s priorities into the owner account in production.  
   Proposed fix: Scope POST writes to `session.user.id` only.

5. Severity: critical  
   Path: `app/api/priorities/update/route.ts:86`  
   Issue: Priority reads use the same `INGEST_USER_ID` fallback, so authenticated users can read back the owner account’s priorities instead of their own.  
   Proposed fix: Scope GET reads to `session.user.id` only.

6. Severity: high  
   Path: `lib/briefing/scorer.ts:1537`  
   Issue: `scoreOpenLoops()` decrypts every signal inline without guarding decrypt failures. One malformed or legacy row will throw during scoring and take down directive generation instead of skipping the bad signal. The same pattern appears in other scorer helpers (`:369`, `:379`, `:476`, `:628`, `:1554`).  
   Proposed fix: Wrap every decrypt in try/catch, drop undecipherable rows from scoring context, and log a bounded warning rather than failing the full scoring run.

7. Severity: high  
   Path: `app/api/settings/spend/route.ts:12`  
   Issue: The route exposes spend data without any auth check even though the file comment says auth is required.  
   Proposed fix: Require a valid session before returning spend totals, or explicitly convert the endpoint into an owner-only cron/admin route.

8. Severity: high  
   Path: `app/api/stripe/checkout/route.ts:38`  
   Issue: Checkout can be created without an authenticated session. In that case `client_reference_id` is omitted, and the webhook cannot associate the subscription with a user record.  
   Proposed fix: Require auth for subscription checkout or implement a separate pre-auth lead flow that creates a user record before checkout.

9. Severity: high  
   Path: `app/api/conviction/generate/route.ts:62`  
   Issue: Artifact generation failures are swallowed and the route still inserts a directive with `execution_result: null`. That violates the product rule that every directive must include a finished artifact.  
   Proposed fix: Generate a fallback artifact on failure or abort the insert and return an explicit error.

10. Severity: high  
    Path: `app/api/onboard/directive/route.ts:37`  
    Issue: The onboarding directive route does not check for the `__GENERATION_FAILED__` sentinel and also allows `artifact` to remain null before persisting a `pending_approval` action.  
    Proposed fix: Mirror the failure-sentinel and fallback-artifact handling used in `/api/conviction/generate`, and fail the request if a valid artifact cannot be produced.

11. Severity: high  
    Path: `app/api/onboard/free-directive/route.ts:44`  
    Issue: The free-directive route has the same failure mode: it does not reject the generation-failure sentinel and persists actions even when artifact generation fails.  
    Proposed fix: Validate the directive before insert and require a non-null artifact or fallback artifact before returning success.

12. Severity: high  
    Path: `app/dashboard/relationships/page.tsx:21`  
    Issue: The relationships page expects `briefing.cooling_relationships`, but `/api/briefing/latest` never returns that property. This page will always fall back to the empty state even when relationship data exists.  
    Proposed fix: Either return `cooling_relationships` from `app/api/briefing/latest/route.ts` or point the page at a route that actually exposes relationship data.

13. Severity: high  
    Path: `app/api/conviction/execute/route.ts:31`  
    Issue: `executeAction()` is called without a surrounding try/catch. Any thrown error escapes as an unstructured 500 instead of a JSON API error.  
    Proposed fix: Wrap the call in try/catch and return `apiError()` or a structured `NextResponse.json(...)` failure.

14. Severity: high  
    Path: `app/api/drafts/decide/route.ts:33`  
    Issue: The draft decision route has the same missing top-level error handling around `executeAction()`.  
    Proposed fix: Add a try/catch around the execution call and return a structured JSON error.

15. Severity: high  
    Path: `app/api/cron/daily-send/route.ts:25`  
    Issue: Every generated directive is emailed to the single `DAILY_BRIEF_TO_EMAIL` address while the route iterates every detected user ID. In a database containing temp onboarding users or stray accounts, one inbox receives other users’ directives.  
    Proposed fix: Resolve the actual recipient per user, or hard-scope the cron to the one owner account the app supports.

16. Severity: high  
    Path: `app/api/cron/daily-generate/route.ts:34`  
    Issue: The generator cron walks every `tkg_entities.name = 'self'` user in a single-user app. Public temp onboarding records can expand this set, increasing cost and feeding downstream mail leakage.  
    Proposed fix: Restrict the cron to the owner/subscribed user set instead of every graph-bearing user.

17. Severity: high  
    Path: `app/api/onboard/goals/route.ts:34`  
    Issue: This is a public write endpoint that inserts directly into production goals without auth or rate limiting. Any caller with a UUID-shaped `tempUserId` can create rows.  
    Proposed fix: Add rate limiting plus signed onboarding tokens, or move temp-user writes behind a server-issued session.

18. Severity: high  
    Path: `app/api/onboard/ingest/route.ts:18`  
    Issue: This public route writes extracted graph data for arbitrary `tempUserId` values and has no rate limiting or abuse protection.  
    Proposed fix: Add rate limiting, server-issued temp-user claims, and write quotas for unauthenticated onboarding flows.

19. Severity: medium  
    Path: `app/api/briefing/latest/route.ts:30`  
    Issue: The route ignores query errors from the four parallel Supabase reads and will quietly generate or return stats against partial/failed reads.  
    Proposed fix: Check each response’s `error` field before using `.data` / `.count`, and fail fast when the backing queries fail.

20. Severity: medium  
    Path: `lib/briefing/generator.ts:546`  
    Issue: `generateBriefing()` writes a cached briefing even if `generateDirective()` returned the `__GENERATION_FAILED__` sentinel. That can cache an internal failure message as a real briefing.  
    Proposed fix: Abort the briefing write when directive generation fails, and surface a structured error back to `/api/briefing/latest`.

21. Severity: medium  
    Path: `app/api/conviction/latest/route.ts:27`  
    Issue: The file header says the route falls back to the latest action of any status, but the implementation only queries `pending_approval` and otherwise returns an empty greeting payload.  
    Proposed fix: Implement the documented fallback or update the route contract and dependent UI to match the real behavior.

22. Severity: medium  
    Path: `app/api/integrations/status/route.ts:35`  
    Issue: Integration query failures are logged but still returned as HTTP 200 with an empty list. `tokenResult.error` is also ignored entirely. The settings UI cannot distinguish “no integrations” from “backend failure.”  
    Proposed fix: Propagate query failures with a non-200 response and handle both query errors explicitly.

23. Severity: medium  
    Path: `app/api/subscription/status/route.ts:24`  
    Issue: `getSubscriptionStatus()` is called without error handling. Any thrown dependency error becomes an unstructured 500.  
    Proposed fix: Wrap the status lookup in try/catch and return a stable JSON error contract.

24. Severity: medium  
    Path: `app/api/google/disconnect/route.ts:29`  
    Issue: The route ignores the result of the `integrations` update and can return `{ ok: true }` even if the row was never marked inactive.  
    Proposed fix: Check the Supabase update result and return an error when the write fails.

25. Severity: medium  
    Path: `app/api/microsoft/disconnect/route.ts:29`  
    Issue: Same silent-write failure pattern as Google disconnect.  
    Proposed fix: Validate the update result before returning success.

26. Severity: medium  
    Path: `app/page.tsx:459`  
    Issue: Waitlist capture marks submission as successful on network failure, which hides dropped leads from both the user and operators.  
    Proposed fix: Only show success on `2xx` / `409`, and surface a retryable error for network or server failures.

27. Severity: medium  
    Path: `app/try/page.tsx:153`  
    Issue: The `/try` waitlist capture has the same false-success path on network errors.  
    Proposed fix: Match the fix above and show a real retry state on failure.

28. Severity: medium  
    Path: `app/pricing/page.tsx:15`  
    Issue: The page hardcodes a specific Stripe price ID instead of using server config, and `handleCheckout()` never clears `loading` when the response is non-OK or lacks a redirect URL. One bad response leaves the CTA stuck forever.  
    Proposed fix: Remove the hardcoded price ID from the client, rely on the server-side default price, and reset/show error state on every non-success branch.

29. Severity: medium  
    Path: `components/dashboard/dashboard-content.tsx:96`  
    Issue: Initial conviction loading never sets `convictionLoading`, so the dashboard can briefly render the empty-state CTA before `/api/conviction/latest` returns.  
    Proposed fix: Toggle `convictionLoading` during the initial fetch and render the card skeleton until the request resolves.

30. Severity: medium  
    Path: `components/dashboard/dashboard-content.tsx:43`  
    Issue: The email deep-link approve/skip path calls `/api/conviction/execute` but never checks `res.ok`, so API failures are silently swallowed and the user gets no feedback.  
    Proposed fix: Validate the HTTP status, surface an error banner on failure, and avoid silently ignoring rejected deep-link actions.

31. Severity: medium  
    Path: `app/dashboard/signals/page.tsx:64`  
    Issue: The signals dashboard renders hardcoded operational data (`Sources connected`, `Updated`, progress bars, “Foldera reads new items nightly at 2 AM”) instead of using API values. The screen can look healthy even when the backend is stale or disconnected.  
    Proposed fix: Drive these values from real API fields or remove them until real data exists.

32. Severity: medium  
    Path: `lib/briefing/generator.ts:45`  
    Issue: The generator prompt still contains a hardcoded blacklist and locked decisions tied to old identity/context data (`Kapp Advisory`, `Bloomreach`, `Nicole Vreeland`, etc.). That is brittle production behavior hidden in prompt text.  
    Proposed fix: Move user-specific exclusions into data/config, version them explicitly, and delete obsolete context from the base prompt.

33. Severity: medium  
    Path: `lib/briefing/generator.ts:146`  
    Issue: Production logging remains in the generator and includes directive titles, scores, and model failure output. That is user-behavior data in production logs.  
    Proposed fix: Replace raw `console.*` calls with structured, redacted server logging or remove them entirely in production.

34. Severity: medium  
    Path: `lib/briefing/scorer.ts:1450`  
    Issue: The scorer logs anti-pattern titles, divergence labels, and top candidate details directly to stdout. Those logs contain private behavioral content.  
    Proposed fix: Remove or redact scorer diagnostics outside local development.

35. Severity: low  
    Path: `app/page.tsx:452`  
    Issue: The landing-page demo swallows every `/api/try/analyze` error into one generic message, which makes rate-limit, config, and parsing failures indistinguishable during production debugging.  
    Proposed fix: Preserve a safe user-facing message but map expected failure classes to clearer copy and diagnostics.

36. Severity: low  
    Path: `app/try/page.tsx:146`  
    Issue: Same generic error handling pattern as the landing page demo.  
    Proposed fix: Distinguish rate limiting, service unavailability, and generic failures.

37. Severity: low  
    Path: `components/dashboard/draft-queue.tsx:76`  
    Issue: The draft queue returns `null` while loading, so the dashboard has no loading affordance for a component that polls user actions.  
    Proposed fix: Render a lightweight skeleton or placeholder while `/api/drafts/pending` is in flight.

38. Severity: low  
    Path: `components/dashboard/trial-banner.tsx:52`  
    Issue: Checkout-init failures are pushed to `console.error` with no user-visible fallback.  
    Proposed fix: Remove the production console call and show an inline billing error state.

39. Severity: low  
    Path: `app/dashboard/settings/SettingsClient.tsx:49`  
    Issue: Settings fetch failures are logged with `console.error` in production.  
    Proposed fix: Route through structured logging and show a stable inline error state instead of shipping raw console output.
