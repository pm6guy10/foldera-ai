# 📋 Quick Reference - Meeting Prep MVP

## 🚀 Start Testing (5 Commands)

```bash
# 1. Start server
pnpm dev

# 2. Visit dashboard
# Open: http://localhost:3000/dashboard
# Sign in with Google

# 3. Sync calendar (browser console)
fetch('/api/meeting-prep/sync',{method:'POST'}).then(r=>r.json()).then(console.log)

# 4. List meetings (saves ID to window.testMeetingId)
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list_meetings'})}).then(r=>r.json()).then(d=>{console.log(d);window.testMeetingId=d.meetings[0].id})

# 5. Generate brief
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate_brief',params:{meetingId:window.testMeetingId}})}).then(r=>r.json()).then(console.log)

# 6. Send email
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send_email',params:{briefId:window.testMeetingId}})}).then(r=>r.json()).then(console.log)
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `TESTING_STEPS_NOW.md` | **START HERE** - Complete test guide |
| `docs/QUICK_START_TESTING.md` | 10-minute quick start |
| `docs/TESTING_GUIDE.md` | Detailed testing + troubleshooting |
| `docs/MEETING_PREP_SETUP.md` | Environment setup guide |
| `MEETING_PREP_MVP_COMPLETE.md` | Complete system summary |

---

## 🗄️ Database Tables

```sql
-- Check meetings
SELECT * FROM meetings ORDER BY start_time;

-- Check briefs
SELECT * FROM briefs ORDER BY generated_at DESC;

-- Check sync logs
SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 5;

-- Check email cache
SELECT COUNT(*) FROM emails_cache;
```

---

## 🔧 Environment Variables Needed

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AI
ANTHROPIC_API_KEY=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=onboarding@resend.dev
```

---

## 📡 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/meeting-prep/sync` | POST | Manual sync |
| `/api/meeting-prep/status` | GET | User status |
| `/api/meeting-prep/meetings` | GET | Get meetings |
| `/api/meeting-prep/briefs/[id]` | GET | Get brief |
| `/api/meeting-prep/briefs/generate/[meetingId]` | POST | Generate brief |
| `/api/meeting-prep/test` | POST | Test utilities |

---

## 🐛 Common Issues

| Issue | Fix |
|-------|-----|
| "Unauthorized" | Sign in again: http://localhost:3000/dashboard |
| "redirect_uri_mismatch" | Check Google OAuth redirect URI |
| No meetings found | Ensure events have attendees |
| Brief fails | Check Anthropic API key & credits |
| Email not received | Check spam folder |

---

## ⏱️ Time Estimates

- **First-time setup:** 30 minutes
- **Testing flow:** 10 minutes  
- **Total:** 40 minutes to verify everything works

---

## ✅ Success Checklist

- [ ] Environment variables set
- [ ] Database migrated
- [ ] Google OAuth configured
- [ ] Test calendar events created
- [ ] Server running (`pnpm dev`)
- [ ] Signed in with Google
- [ ] Calendar synced
- [ ] Brief generated
- [ ] Email received

---

## 🎯 Next Actions

1. **Test:** Follow `TESTING_STEPS_NOW.md`
2. **Verify:** Check email inbox for brief
3. **Deploy:** Push to Vercel when ready
4. **Iterate:** Improve AI prompts based on feedback

---

## 💡 Pro Tips

- Use browser console for fast testing
- Check Supabase dashboard to see data
- Monitor terminal for errors
- Save meeting IDs with `window.testMeetingId`
- Test with simple meetings first

---

**Questions? Check `TESTING_STEPS_NOW.md` or `docs/TESTING_GUIDE.md`**

**Ready to test? Run `pnpm dev` and visit http://localhost:3000/dashboard** 🚀

