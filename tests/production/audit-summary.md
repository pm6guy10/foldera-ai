# Foldera Production Audit

**Generated:** 2026-03-31T23:23:29.738Z
**Total findings:** 39 (0 errors, 0 warnings, 39 info)

## INFO (39)

- **[meta]** `public/` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[button]** `public/` — Button: "APPROVE" disabled=false
- **[button]** `public/` — Button: "SKIP" disabled=false
- **[button]** `public/` — Button: "APPROVE & SEND" disabled=false
- **[button]** `public/` — Button: "Prev" disabled=false
- **[button]** `public/` — Button: "Next" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[button]** `public/` — Button: "(no text)" disabled=false
- **[meta]** `public/login` — Page title: "Sign in — Foldera — Foldera"
- **[button]** `public/login` — Button: "Continue with Google" disabled=false
- **[button]** `public/login` — Button: "Continue with Microsoft" disabled=false
- **[meta]** `public/start` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/start` — Button: "Continue with Google" disabled=false
- **[button]** `public/start` — Button: "Continue with Microsoft" disabled=false
- **[meta]** `public/pricing` — Page title: "Pricing — Foldera — Foldera"
- **[meta]** `public/blog` — Page title: "Blog — Foldera — Foldera"
- **[meta]** `public/blog/ai-email-assistant` — Page title: "AI That Reads My Email and Tells Me What to Do Every Morning — Foldera"
- **[meta]** `public/blog/ai-task-prioritization` — Page title: "AI That Prioritizes My Tasks (By Eliminating Them) — Foldera"
- **[meta]** `public/blog/best-ai-tools-solopreneurs-2026` — Page title: "Best AI Tools for Solopreneurs 2026 — Foldera"
- **[meta]** `public/blog/reduce-email-overwhelm` — Page title: "Reduce Email Overwhelm (By Handling What You're Avoiding) — Foldera"
- **[meta]** `public/blog/ai-assistant-busy-professionals` — Page title: "AI Assistant for Busy Professionals (That Actually Reduces Work) — Foldera"
- **[button-ok]** `interact/` — Button "APPROVE" clicked — no errors
- **[button-ok]** `interact/` — Button "SKIP" clicked — no errors
- **[button-effect]** `interact/` — Button "APPROVE & SEND" changed page content
- **[button-ok]** `interact/` — Button "APPROVE & SEND" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[api-health]** `/api/auth/session` — 200 in 760ms — shape OK (expected: { user: { id, email } })
  > {"user":{"name":"Brandon Kapp","email":"b-kapp@outlook.com","image":"data:image/jpeg;base64, iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcd
- **[api-health]** `/api/integrations/status` — 200 in 122ms — shape OK (expected: { integrations: [] })
  > {"integrations":[{"provider":"google","is_active":true,"sync_email":"b.kapp1010@gmail.com","last_synced_at":null,"scopes":"https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/a
- **[api-health]** `/api/conviction/latest` — 200 in 967ms — shape OK (expected: status 200 (any body))
  > {"context_greeting":"Tuesday evening. 105 active commitments. Top priority: Resolve ESD overpayment waiver (Claim 2MFDBB-007, RCW 50.20.190, hardship waiver submitted, follow up 800-318-6022 if no res
- **[api-health]** `/api/subscription/status` — 200 in 741ms — shape OK (expected: { status: string })
  > {"plan":"pro","status":"active","daysRemaining":999}
- **[api-health]** `/api/onboard/set-goals` — 200 in 708ms — shape OK (expected: status 200)
  > {"buckets":["Business ops","Relationships","Job search","Financial","Health & family"],"freeText":"Be a stronger spiritual leader"}
- **[generate-now]** `settings/generate-now` — Success: "generated and sent" appeared after 70418ms
