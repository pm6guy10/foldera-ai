# Foldera Production Audit

**Generated:** 2026-04-01T03:33:53.393Z
**Total findings:** 23 (0 errors, 0 warnings, 23 info)

## INFO (23)

- **[meta]** `public/blog` — Page title: "Blog — Foldera — Foldera"
- **[meta]** `public/blog/ai-email-assistant` — Page title: "AI That Reads My Email and Tells Me What to Do Every Morning — Foldera"
- **[meta]** `public/blog/ai-task-prioritization` — Page title: "AI That Prioritizes My Tasks (By Eliminating Them) — Foldera"
- **[meta]** `public/blog/best-ai-tools-solopreneurs-2026` — Page title: "Best AI Tools for Solopreneurs 2026 — Foldera"
- **[meta]** `public/blog/reduce-email-overwhelm` — Page title: "Reduce Email Overwhelm (By Handling What You're Avoiding) — Foldera"
- **[meta]** `public/blog/ai-assistant-busy-professionals` — Page title: "AI Assistant for Busy Professionals (That Actually Reduces Work) — Foldera"
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
- **[api-health]** `/api/auth/session` — 200 in 747ms — shape OK (expected: { user: { id, email } })
  > {"user":{"name":"Brandon Kapp","email":"b-kapp@outlook.com","image":"data:image/jpeg;base64, iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcd
- **[api-health]** `/api/integrations/status` — 200 in 44ms — shape OK (expected: { integrations: [] })
  > {"integrations":[{"provider":"google","is_active":true,"sync_email":null,"last_synced_at":"2026-04-01T03:32:20.974+00:00","scopes":null},{"provider":"azure_ad","is_active":true,"sync_email":null,"last
- **[api-health]** `/api/conviction/latest` — 200 in 896ms — shape OK (expected: status 200 (any body))
  > {"id":"729ede47-01a4-4f29-85dd-349b2e105a00","userId":"e40b7cd8-4925-42f7-bc99-5022969f1d22","directive":"Financial runway expires in 3 months with no documented contingency; Cheryl's administrative r
- **[api-health]** `/api/subscription/status` — 200 in 576ms — shape OK (expected: { status: string })
  > {"plan":"pro","status":"active","daysRemaining":999}
- **[api-health]** `/api/onboard/set-goals` — 200 in 683ms — shape OK (expected: status 200)
  > {"buckets":["Business ops","Relationships","Job search","Financial","Health & family"],"freeText":"Be a stronger spiritual leader"}
- **[generate-now]** `settings/generate-now` — Success: "generated and sent" appeared after 8007ms
