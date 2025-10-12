# 🚀 START HERE - Test Meeting Prep MVP Now

## ⚡ What You Have

I've built a complete Meeting Prep MVP with:
- ✅ Database schema (Supabase migration ready)
- ✅ Google OAuth authentication (NextAuth)
- ✅ Calendar sync (Google Calendar API)
- ✅ Email sync (Gmail API)
- ✅ AI brief generation (Claude)
- ✅ Email delivery (Resend)
- ✅ Automated cron jobs
- ✅ API endpoints for testing
- ✅ Test utilities

**Total files created:** 25+ files across database, backend, APIs, and documentation

---

## 📋 Before You Start - Quick Setup

### 1. Environment Variables

Create `.env.local` in your project root:

```bash
# Database (from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Auth (generate secret: openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

# Anthropic (from console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-api03-your-key

# Resend (from resend.com)
RESEND_API_KEY=re_your-key
RESEND_FROM_EMAIL=onboarding@resend.dev
```

### 2. Run Database Migration

```bash
# Open Supabase Dashboard → SQL Editor
# Copy-paste contents of: supabase/migrations/20250112000000_meeting_prep_system.sql
# Click RUN
```

This creates all tables: `meeting_prep_users`, `meetings`, `briefs`, `emails_cache`, `sync_logs`

### 3. Setup Google OAuth

**Google Cloud Console (console.cloud.google.com):**

1. Create project or select existing
2. Enable APIs:
   - Google Calendar API
   - Gmail API
3. Create OAuth Client ID (Web application)
4. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Configure OAuth consent screen
6. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `email`, `profile`

### 4. Create Test Calendar Events

**In your Google Calendar:**

Create 1-2 meetings for next week with:
- Attendees (fake emails OK like `sarah@test.com`)
- Title and description
- Start time

Example:
```
Title: Q4 Planning Call
Date: Tomorrow at 2 PM
Attendees: sarah@test.com, marcus@test.com
Description: Discuss Q4 budget and roadmap
```

---

## 🧪 Test Flow (10 Minutes)

### Step 1: Start Dev Server

```bash
cd c:\Users\b-kap\foldera-ai
pnpm dev
```

Open: http://localhost:3000

### Step 2: Sign In

Visit: http://localhost:3000/dashboard

Click "Sign in with Google" → Grant permissions

### Step 3: Open Browser Console

Press `F12` → Console tab

### Step 4: Sync Calendar

**Copy-paste this:**

```javascript
fetch('/api/meeting-prep/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Sync result:', data);
    console.log(`Found ${data.meetings_synced} meetings`);
  })
```

### Step 5: List Meetings

**Copy-paste this:**

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'list_meetings' })
})
  .then(r => r.json())
  .then(data => {
    console.log('📅 Meetings:', data);
    if (data.meetings && data.meetings.length > 0) {
      window.testMeetingId = data.meetings[0].id;
      console.log('✅ Saved meeting ID:', window.testMeetingId);
    }
  })
```

### Step 6: Generate Brief

**Copy-paste this:**

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'generate_brief',
    params: { meetingId: window.testMeetingId }
  })
})
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      console.log('✅ Brief generated!\n');
      const b = data.brief.content;
      
      console.log('🔑 KEY CONTEXT:');
      b.key_context.forEach((item, i) => console.log(`  ${i+1}. ${item}`));
      
      console.log('\n💡 WHAT TO SAY:');
      b.what_to_say.forEach((item, i) => console.log(`  ${i+1}. ${item}`));
      
      console.log('\n⚠️ WHAT TO AVOID:');
      b.what_to_avoid.forEach((item, i) => console.log(`  ${i+1}. ${item}`));
      
      console.log(`\n⏱️ Generated in ${data.generationTime}ms`);
    }
  })
```

**Check the brief content** - it should have relevant suggestions!

### Step 7: Send Email

**Copy-paste this:**

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'send_email',
    params: { briefId: window.testMeetingId }
  })
})
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      console.log('✅ Email sent! Check your inbox!');
    }
  })
```

**Check your email inbox** - you should receive the brief!

---

## ✅ Success Criteria

After all steps:

- [x] Authenticated with Google
- [x] Calendar synced (meetings in database)
- [x] Brief generated with AI
- [x] Email sent successfully
- [x] Brief email received and looks good

---

## 📚 Full Documentation

### If You Need More Help:

1. **Quick Start (10 min):** `docs/QUICK_START_TESTING.md`
2. **Full Testing Guide:** `docs/TESTING_GUIDE.md`
3. **Setup Instructions:** `docs/MEETING_PREP_SETUP.md`
4. **System Overview:** `docs/MEETING_PREP_README.md`

### Code Structure:

- **Database:** `supabase/migrations/20250112000000_meeting_prep_system.sql`
- **Types:** `types/meeting-prep.ts`
- **Auth:** `lib/meeting-prep/auth.ts`
- **Calendar:** `lib/meeting-prep/google-calendar.ts`
- **Gmail:** `lib/meeting-prep/gmail.ts`
- **AI Briefs:** `lib/meeting-prep/brief-generator.ts`
- **Email:** `lib/meeting-prep/email.ts`
- **Orchestrator:** `lib/meeting-prep/orchestrator.ts`
- **Test Helpers:** `lib/meeting-prep/test-helpers.ts`
- **API Routes:** `app/api/meeting-prep/` and `app/api/cron/`
- **Cron Config:** `vercel.json`

---

## 🐛 Troubleshooting

### "Unauthorized" errors
→ Sign in again: http://localhost:3000/dashboard

### "redirect_uri_mismatch"
→ Check Google OAuth redirect URI is `http://localhost:3000/api/auth/callback/google`

### No meetings found
→ Make sure calendar events have attendees (not single-person events)

### Brief generation fails
→ Check `ANTHROPIC_API_KEY` is valid and has credits

### Email not received
→ Check spam folder, verify `RESEND_API_KEY` is set

---

## 🎯 What's Next

Once basic testing works:

1. **Add email context** - Create test email threads with "attendees"
2. **Test with real data** - Use actual work account
3. **Test timing** - Create meeting 45 min away, see auto-brief
4. **Test cron jobs** - See automated workflow
5. **Deploy to Vercel** - Production environment
6. **Add dashboard UI** - Visual interface (currently using console)

---

## 💡 Key Files to Know

**Start testing here:**
- `TESTING_STEPS_NOW.md` (this file)
- `docs/QUICK_START_TESTING.md`

**When you hit issues:**
- `docs/TESTING_GUIDE.md` → Troubleshooting section
- Supabase Dashboard → SQL Editor (check data)
- Browser Console → Network tab (check API calls)
- Terminal → Server logs (check errors)

**Understanding the system:**
- `docs/MEETING_PREP_README.md` → Architecture overview
- `types/meeting-prep.ts` → Data structures
- `lib/meeting-prep/orchestrator.ts` → Main workflow

---

## ⏰ Time Estimate

- **Setup (first time):** 20-30 minutes
- **Testing flow:** 10 minutes
- **Troubleshooting:** 0-15 minutes
- **Total:** ~30-60 minutes to complete verification

---

## 🚀 Let's Go!

1. Set environment variables ☝️
2. Run database migration ☝️
3. Setup Google OAuth ☝️
4. Create test calendar events ☝️
5. Run the test flow ☝️

**You've got this!** 💪

---

**Questions? Check the docs or review error messages carefully.**

Good luck! 🎉

