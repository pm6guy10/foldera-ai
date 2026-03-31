# Foldera Production Audit

**Generated:** 2026-03-30T17:09:14.922Z
**Total findings:** 39 (0 errors, 0 warnings, 39 info)

## INFO (39)

- **[meta]** `public/` — Page title: "Foldera — Finished work, every morning"
- **[button]** `public/` — Button: "APPROVE" disabled=false
- **[button]** `public/` — Button: "SKIP" disabled=false
- **[button]** `public/` — Button: "APPROVE & SEND" disabled=false
- **[button]** `public/` — Button: "Prev" disabled=false
- **[button]** `public/` — Button: "Next" disabled=false
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
- **[button-effect]** `interact/` — Button "APPROVE & SEND" changed page content
- **[button-ok]** `interact/` — Button "APPROVE & SEND" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[button-effect]** `interact/` — Button "" changed page content
- **[button-ok]** `interact/` — Button "" clicked — no errors
- **[api-health]** `/api/auth/session` — 200 in 582ms — shape OK (expected: { user: { id, email } })
  > {"user":{"name":"Brandon Kapp","email":"b-kapp@outlook.com","image":"data:image/jpeg;base64, iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcd
- **[api-health]** `/api/integrations/status` — 200 in 78ms — shape OK (expected: { integrations: [] })
  > {"integrations":[{"provider":"azure_ad","is_active":true,"sync_email":null,"last_synced_at":"2026-03-30T16:57:29.935+00:00","scopes":null},{"provider":"google","is_active":true,"sync_email":null,"last
- **[api-health]** `/api/conviction/latest` — 200 in 1038ms — shape OK (expected: status 200 (any body))
  > {"id":"b4970602-b752-4ea3-b7cd-8ac8aa4c7deb","userId":"e40b7cd8-4925-42f7-bc99-5022969f1d22","directive":"Publish a decision memo that locks owner accountability and deadline by 5:00 PM PT on 2026-03-
- **[api-health]** `/api/subscription/status` — 200 in 775ms — shape OK (expected: { status: string })
  > {"plan":"pro","status":"active","daysRemaining":999}
- **[api-health]** `/api/onboard/set-goals` — 200 in 697ms — shape OK (expected: status 200)
  > {"buckets":["Business ops","Relationships","Job search","Financial","Health & family"],"freeText":"Be a stronger spiritual leader"}
- **[generate-now]** `settings/generate-now` — Success: "generated and sent" appeared after 8838ms
