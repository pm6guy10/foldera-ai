# Foldera Production Audit

**Generated:** 2026-04-03T17:08:14.538Z
**Total findings:** 47 (0 errors, 0 warnings, 47 info)

## INFO (47)

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
- **[meta]** `public/login` — Page title: "Sign in — Foldera"
- **[button]** `public/login` — Button: "CONTINUE WITH GOOGLE" disabled=false
- **[button]** `public/login` — Button: "CONTINUE WITH MICROSOFT" disabled=false
- **[meta]** `public/start` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/start` — Button: "CONTINUE WITH GOOGLE" disabled=false
- **[button]** `public/start` — Button: "CONTINUE WITH MICROSOFT" disabled=false
- **[meta]** `public/pricing` — Page title: "Pricing — Foldera"
- **[button]** `public/pricing` — Button: "(no text)" disabled=false
- **[meta]** `public/blog` — Page title: "Blog — Foldera — Foldera"
- **[button]** `public/blog` — Button: "(no text)" disabled=false
- **[meta]** `public/blog/ai-email-assistant` — Page title: "AI That Reads My Email and Tells Me What to Do Every Morning — Foldera"
- **[button]** `public/blog/ai-email-assistant` — Button: "(no text)" disabled=false
- **[meta]** `public/blog/ai-task-prioritization` — Page title: "AI That Prioritizes My Tasks (By Eliminating Them) — Foldera"
- **[button]** `public/blog/ai-task-prioritization` — Button: "(no text)" disabled=false
- **[meta]** `public/blog/best-ai-tools-solopreneurs-2026` — Page title: "Best AI Tools for Solopreneurs 2026 — Foldera"
- **[button]** `public/blog/best-ai-tools-solopreneurs-2026` — Button: "(no text)" disabled=false
- **[meta]** `public/blog/reduce-email-overwhelm` — Page title: "Reduce Email Overwhelm (By Handling What You're Avoiding) — Foldera"
- **[button]** `public/blog/reduce-email-overwhelm` — Button: "(no text)" disabled=false
- **[meta]** `public/blog/ai-assistant-busy-professionals` — Page title: "AI Assistant for Busy Professionals (That Actually Reduces Work) — Foldera"
- **[button]** `public/blog/ai-assistant-busy-professionals` — Button: "(no text)" disabled=false
- **[button-effect]** `interact/` — Button "APPROVE" changed page content
- **[button-ok]** `interact/` — Button "APPROVE" clicked — no errors
- **[button-effect]** `interact/` — Button "SKIP" changed page content
- **[button-ok]** `interact/` — Button "SKIP" clicked — no errors
- **[button-effect]** `interact/` — Button "APPROVE & SEND" changed page content
- **[button-ok]** `interact/` — Button "APPROVE & SEND" clicked — no errors
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[api-health]** `/api/auth/session` — 200 in 687ms — shape OK (expected: { user: { id, email } })
  > {"user":{"name":"Brandon Kapp","email":"b-kapp@outlook.com","image":"data:image/jpeg;base64, iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcd
- **[api-health]** `/api/integrations/status` — 200 in 139ms — shape OK (expected: { integrations: [] })
  > {"integrations":[{"provider":"google","is_active":true,"sync_email":null,"last_synced_at":"2026-04-03T17:06:54.945+00:00","scopes":null,"expires_at":1775239613,"needs_reconnect":false},{"provider":"az
- **[api-health]** `/api/conviction/latest` — 200 in 1443ms — shape OK (expected: status 200 (any body))
  > {"context_greeting":"Friday evening. 105 active commitments. Top priority: Resolve ESD overpayment waiver (Claim 2MFDBB-007, RCW 50.20.190, hardship waiver submitted, follow up 800-318-6022 if no resp
- **[api-health]** `/api/subscription/status` — 200 in 734ms — shape OK (expected: { status: string })
  > {"plan":"pro","status":"active","current_period_end":"2026-04-19T23:10:33.661601+00:00","daysRemaining":17,"can_manage_billing":true}
- **[api-health]** `/api/onboard/set-goals` — 200 in 783ms — shape OK (expected: status 200)
  > {"buckets":["Business ops","Relationships","Job search","Financial","Health & family"],"freeText":"Be a stronger spiritual leader"}
- **[generate-now]** `settings/generate-now` — Success: "generated and sent" appeared after 8686ms
