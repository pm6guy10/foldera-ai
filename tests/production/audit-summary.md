# Foldera Production Audit

**Generated:** 2026-03-28T16:49:54.558Z
**Total findings:** 38 (4 errors, 1 warnings, 33 info)

## ERROR (4)

- **[api-health]** `/api/integrations/status` — 401 in 16ms — shape MISMATCH (expected: { integrations: [] })
  > {"error":"Unauthorized"}
- **[api-health]** `/api/conviction/latest` — 401 in 14ms — shape MISMATCH (expected: status 200 (any body))
  > {"error":"Unauthorized"}
- **[api-health]** `/api/subscription/status` — 401 in 21ms — shape MISMATCH (expected: { status: string })
  > {"error":"Unauthorized"}
- **[api-health]** `/api/onboard/set-goals` — 401 in 16ms — shape MISMATCH (expected: status 200)
  > {"error":"Unauthorized"}

## WARNING (1)

- **[api-health]** `/api/auth/session` — 200 in 16ms — shape MISMATCH (expected: { user: { id, email } })
  > {}

## INFO (33)

- **[meta]** `public/` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/` — Button: "APPROVE" disabled=false
- **[button]** `public/` — Button: "SKIP" disabled=false
- **[button]** `public/` — Button: "APPROVE & SEND" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[meta]** `public/login` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/login` — Button: "Continue with Google" disabled=false
- **[button]** `public/login` — Button: "Continue with Microsoft" disabled=false
- **[meta]** `public/start` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/start` — Button: "Continue with Google" disabled=false
- **[button]** `public/start` — Button: "Continue with Microsoft" disabled=false
- **[meta]** `public/pricing` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/pricing` — Button: "GET STARTED FREE" disabled=false
- **[meta]** `public/blog` — Page title: "Foldera Blog"
- **[meta]** `public/blog/ai-email-assistant` — Page title: "AI That Reads My Email and Tells Me What to Do Every Morning"
- **[meta]** `public/blog/ai-task-prioritization` — Page title: "AI That Prioritizes My Tasks (By Eliminating Them)"
- **[meta]** `public/blog/best-ai-tools-solopreneurs-2026` — Page title: "Best AI Tools for Solopreneurs 2026"
- **[meta]** `public/blog/reduce-email-overwhelm` — Page title: "Reduce Email Overwhelm (By Handling What You're Avoiding)"
- **[meta]** `public/blog/ai-assistant-busy-professionals` — Page title: "AI Assistant for Busy Professionals (That Actually Reduces Work)"
- **[button-ok]** `interact/` — Button "APPROVE" clicked — no errors
- **[button-ok]** `interact/` — Button "SKIP" clicked — no errors
- **[button-ok]** `interact/` — Button "APPROVE & SEND" clicked — no errors
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[auth-guard]** `auth/dashboard` — Auth guard redirect from /dashboard → http://localhost:3000/login?callbackUrl=%2Fdashboard
- **[auth-guard]** `auth/dashboard/settings` — Auth guard redirect from /dashboard/settings → http://localhost:3000/login?callbackUrl=%2Fdashboard%2Fsettings
- **[auth-guard]** `auth/onboard?edit=true` — Auth guard redirect from /onboard?edit=true → http://localhost:3000/login?callbackUrl=%2Fonboard%3Fedit%3Dtrue
- **[auth-guard]** `settings/generate-now` — Redirected to http://localhost:3000/login?callbackUrl=%2Fdashboard%2Fsettings — skipping Generate now test
