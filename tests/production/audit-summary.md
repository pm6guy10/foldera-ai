# Foldera Production Audit

**Generated:** 2026-04-01T06:09:47.192Z
**Total findings:** 21 (0 errors, 0 warnings, 21 info)

## INFO (21)

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
- **[api-health]** `/api/auth/session` — 200 in 721ms — shape OK (expected: { user: { id, email } })
  > {"user":{"name":"Brandon Kapp","email":"b-kapp@outlook.com","image":"data:image/jpeg;base64, iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcd
- **[api-health]** `/api/integrations/status` — 200 in 63ms — shape OK (expected: { integrations: [] })
  > {"integrations":[{"provider":"google","is_active":true,"sync_email":null,"last_synced_at":"2026-04-01T05:57:42.753+00:00","scopes":null},{"provider":"azure_ad","is_active":true,"sync_email":null,"last
- **[api-health]** `/api/conviction/latest` — 200 in 1109ms — shape OK (expected: status 200 (any body))
  > {"id":"729ede47-01a4-4f29-85dd-349b2e105a00","userId":"e40b7cd8-4925-42f7-bc99-5022969f1d22","directive":"Financial runway expires in 3 months with no documented contingency; Cheryl's administrative r
- **[api-health]** `/api/subscription/status` — 200 in 551ms — shape OK (expected: { status: string })
  > {"plan":"pro","status":"active","daysRemaining":999}
- **[api-health]** `/api/onboard/set-goals` — 200 in 781ms — shape OK (expected: status 200)
  > {"buckets":["Business ops","Relationships","Job search","Financial","Health & family"],"freeText":"Be a stronger spiritual leader"}
- **[generate-now]** `settings/generate-now` — Success: "generated and sent" appeared after 7324ms
