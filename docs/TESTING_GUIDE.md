# 🧪 Foldera Meeting Prep - End-to-End Testing Guide

This guide walks you through testing the complete meeting prep flow locally.

---

## 📋 Prerequisites

Before testing, ensure you have:

- [x] Completed all setup steps from `MEETING_PREP_SETUP.md`
- [x] Environment variables configured in `.env.local`
- [x] Database migration run successfully
- [x] Google OAuth credentials configured
- [x] Anthropic API key set
- [x] Resend API key set (or using `onboarding@resend.dev`)

---

## 🎯 Test Account Setup

### Step 1: Prepare Your Google Account

Use a **personal Google account** (not your main work account) for testing.

#### A. Create Test Calendar Events

1. Go to https://calendar.google.com
2. Create 2-3 meetings in the next 7 days with the following:

**Meeting 1: "Q4 Planning Call with Sarah"**
- Date: Tomorrow at 2:00 PM
- Duration: 1 hour
- Add attendee: `sarah.test@example.com` (fake email is fine for testing)
- Description: "Discuss Q4 roadmap and budget allocation"

**Meeting 2: "Product Sync with Marcus"**
- Date: 2 days from now at 10:00 AM
- Duration: 30 min
- Add attendee: `marcus.test@example.com`
- Description: "Review new feature specs"

**Meeting 3: "Client Check-in with DataFlow Team"**
- Date: 3 days from now at 3:00 PM
- Duration: 1 hour
- Add attendees: `alex@dataflow.com`, `jen@dataflow.com`
- Description: "Monthly check-in and feedback session"

> **Note:** Google Calendar will send invite emails to these fake addresses, but they'll bounce. That's fine - we just need the events in your calendar.

#### B. Create Test Emails

To test email context, you need some emails with the "attendees":

**Option 1: Send yourself emails**

1. Open Gmail
2. Compose email to yourself
3. Subject: "Re: Q4 Planning - Budget Concerns"
4. Body:
   ```
   Hey [Your Name],
   
   I wanted to follow up on our last conversation about Q4 budget.
   We're seeing some constraints from leadership, so we'll need to
   be strategic about resource allocation.
   
   Looking forward to discussing this in our planning call.
   
   - Sarah
   ```
5. Send it
6. Wait a minute, then reply to create a thread

**Option 2: Create test emails via Gmail filters**

1. Settings → Filters → Create filter
2. Apply label to simulate emails from test attendees
3. Use existing emails and just pretend they're from Sarah/Marcus

**Option 3: Skip email context (for initial testing)**

You can test without emails - the AI will generate briefs based on meeting title/description alone.

---

## 🚀 Step-by-Step Testing Flow

### Step 1: Start Local Development Server

```bash
cd c:\Users\b-kap\foldera-ai

# Install any missing dependencies
pnpm install

# Start dev server
pnpm dev
```

Visit: http://localhost:3000

---

### Step 2: Authenticate with Google

1. Open browser to http://localhost:3000/dashboard
2. You should see a "Sign in with Google" button
3. Click it
4. Select your test Google account
5. **Important:** Google will show OAuth consent screen
   - Click "Continue" or "Advanced" → "Go to Foldera (unsafe)"
   - This is because your app is in testing mode
6. Grant permissions:
   - ✅ See, edit, create and delete all your Google Drive files
   - ✅ See, edit, share, and permanently delete calendars
   - ✅ Read, compose, send, and permanently delete email
7. You should be redirected back to the dashboard

**Verify authentication worked:**

Open browser console and check session:
```javascript
fetch('/api/auth/session')
  .then(r => r.json())
  .then(console.log)
```

You should see your user info.

---

### Step 3: Test API - Check Connection Status

Open browser console:

```javascript
fetch('/api/meeting-prep/status')
  .then(r => r.json())
  .then(console.log)
```

**Expected response:**
```json
{
  "success": true,
  "google_connected": true,
  "upcoming_meetings": 0,
  "pending_briefs": 0,
  "cached_emails": 0
}
```

Initial values will be 0 - that's expected!

---

### Step 4: Sync Calendar

#### Option A: Via API (Console)

```javascript
fetch('/api/meeting-prep/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
  .then(r => r.json())
  .then(console.log)
```

#### Option B: Via Test Utility

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'sync_calendar'
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('Calendar sync result:', data);
    if (data.meetings) {
      console.log('Meetings found:');
      data.meetings.forEach(m => console.log(`  - ${m.summary}`));
    }
  })
```

**Expected result:**
```json
{
  "success": true,
  "meetings_synced": 3,
  "emails_synced": 0
}
```

**Verify in database:**

Go to Supabase Dashboard → SQL Editor:

```sql
SELECT 
  id,
  title,
  start_time,
  attendees,
  brief_generated
FROM meetings
ORDER BY start_time ASC;
```

You should see your 3 test meetings!

---

### Step 5: Sync Gmail (Optional but Recommended)

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'sync_gmail',
    params: { days: 30 }
  })
})
  .then(r => r.json())
  .then(console.log)
```

**Expected result:**
```json
{
  "success": true,
  "message": "Cached 15 emails",
  "emailsCached": 15
}
```

This will cache your recent emails for context.

**Verify:**

```sql
SELECT 
  from_email,
  subject,
  received_at
FROM emails_cache
ORDER BY received_at DESC
LIMIT 10;
```

---

### Step 6: List Meetings Needing Briefs

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'list_meetings'
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('Meetings needing briefs:', data);
    
    // Save the first meeting ID for next step
    if (data.meetings && data.meetings.length > 0) {
      window.testMeetingId = data.meetings[0].id;
      console.log('Saved meeting ID:', window.testMeetingId);
    }
  })
```

**Copy the meeting ID from the output** - you'll need it for the next step!

---

### Step 7: Generate Brief for One Meeting

Using the meeting ID from previous step:

```javascript
// Replace with your actual meeting ID
const meetingId = window.testMeetingId || 'YOUR_MEETING_ID_HERE';

fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'generate_brief',
    params: { meetingId }
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('Brief generated!', data);
    
    if (data.brief) {
      console.log('\n📋 BRIEF CONTENT:');
      console.log('\n🔑 Key Context:');
      data.brief.content.key_context.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n💡 What to Say:');
      data.brief.content.what_to_say.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n⚠️ What to Avoid:');
      data.brief.content.what_to_avoid.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n🔄 Open Threads:');
      data.brief.content.open_threads.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      // Save brief ID for sending
      window.testBriefId = data.brief.id;
      console.log('\nSaved brief ID:', window.testBriefId);
    }
  })
```

**This will:**
- Fetch relevant emails with the meeting attendees
- Send to Claude API to analyze
- Generate intelligent brief
- Save to database
- Display the content

**Expected output:**
- Key context points based on meeting details
- Suggested talking points
- Topics to avoid (if applicable)
- Open threads from emails

**Review the brief quality:**
- Does it make sense given the meeting context?
- Are the suggestions specific or generic?
- If you have test emails, does it reference them?

---

### Step 8: View Email Context (Optional)

To see what emails the AI used:

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'view_emails',
    params: { meetingId: window.testMeetingId }
  })
})
  .then(r => r.json())
  .then(console.log)
```

This shows which emails were found for the meeting attendees.

---

### Step 9: Send Test Brief Email

```javascript
// Get the meeting ID to find its brief
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'send_email',
    params: { briefId: window.testMeetingId } // Uses meeting ID to find brief
  })
})
  .then(r => r.json())
  .then(console.log)
```

**This will:**
- Format the brief as HTML email
- Send via Resend
- Update database

**Check your email inbox!** You should receive the brief.

**Expected email:**
- Subject: "Meeting Brief: [Meeting Title]"
- Nicely formatted with sections
- Time until meeting
- Attendee list
- All brief sections

---

### Step 10: Verify in Database

Check that everything was recorded:

```sql
-- Check meetings
SELECT * FROM meetings WHERE brief_generated = true;

-- Check briefs
SELECT 
  b.id,
  b.generated_at,
  b.sent_at,
  b.ai_tokens_used,
  b.generation_time_ms,
  m.title as meeting_title
FROM briefs b
JOIN meetings m ON b.meeting_id = m.id
ORDER BY b.generated_at DESC;

-- Check sync logs
SELECT * FROM sync_logs 
ORDER BY started_at DESC 
LIMIT 5;
```

---

## 🔄 Test Automated Cron Flow (Optional)

To test the cron jobs locally:

### 1. Generate Cron Secret

```bash
openssl rand -hex 32
```

Add to `.env.local`:
```
CRON_SECRET=your_generated_secret
```

### 2. Test Calendar Sync Cron

```bash
curl -X POST http://localhost:3000/api/cron/sync-calendar \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. Test Gmail Sync Cron

```bash
curl -X POST http://localhost:3000/api/cron/sync-gmail \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 4. Test Brief Generation Cron

```bash
curl -X POST http://localhost:3000/api/cron/generate-briefs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Note:** The brief generation cron only processes meetings 30-90 minutes away. To test:
1. Create a meeting 45 minutes from now
2. Run the cron job
3. Brief should be auto-generated and sent

---

## ✅ Success Checklist

After completing all steps, verify:

- [x] Google OAuth works (can authenticate)
- [x] Calendar syncs successfully (meetings in database)
- [x] Gmail syncs successfully (emails in cache)
- [x] Brief generates with quality content
- [x] Brief references meeting details correctly
- [x] Email sends successfully
- [x] Email formatting looks good
- [x] Database records are correct
- [x] Sync logs show successful operations
- [x] Cron jobs execute (if tested)

---

## 🐛 Troubleshooting

### Issue: OAuth fails with "redirect_uri_mismatch"

**Fix:**
- Go to Google Cloud Console
- Check OAuth redirect URIs include `http://localhost:3000/api/auth/callback/google`
- Make sure `NEXTAUTH_URL=http://localhost:3000` in `.env.local`

### Issue: "Unauthorized" when calling APIs

**Fix:**
- Check that you're logged in: `fetch('/api/auth/session').then(r => r.json()).then(console.log)`
- Try logging out and back in
- Clear cookies and re-authenticate

### Issue: Calendar sync finds 0 meetings

**Possible causes:**
- No meetings with attendees in next 7 days
- All meetings are single-person events
- Token expired (check `google_token_expires_at` in database)

**Fix:**
- Add more calendar events with attendees
- Check Google Calendar scope is granted
- Re-authenticate if token expired

### Issue: Brief generation fails

**Check:**
- Anthropic API key is valid
- API has credits
- Meeting has attendees
- Check error in console logs

### Issue: Email not sending

**Check:**
- Resend API key is valid
- Using `onboarding@resend.dev` for testing (no domain verification needed)
- Check Resend dashboard for delivery status
- Check spam folder

### Issue: Brief content is generic/poor quality

**Possible reasons:**
- No relevant emails found (need more email context)
- Meeting description is vague
- Test data is too simple

**Improve by:**
- Adding more descriptive meeting details
- Creating more test email threads
- Using real email history

---

## 📊 Monitoring & Logs

### Check Logs

**Terminal logs:**
- Look for `[Calendar]`, `[Gmail]`, `[Brief]`, `[Email]` prefixes
- Errors will be clearly marked

**Database logs:**
```sql
SELECT * FROM sync_logs 
WHERE status = 'error'
ORDER BY started_at DESC;
```

### Performance Metrics

Check brief generation times:

```sql
SELECT 
  AVG(generation_time_ms) as avg_time_ms,
  AVG(ai_tokens_used) as avg_tokens
FROM briefs;
```

Good performance:
- Generation time: < 10 seconds
- Token usage: 2000-4000 tokens

---

## 🎯 Next Steps

Once everything works:

1. **Test with real data** - Use your actual work account
2. **Test timing** - Create meeting 45 min away, verify auto-brief
3. **Test edge cases** - Cancelled meetings, all-day events, recurring events
4. **Test multiple users** - Add a second Google account
5. **Deploy to Vercel** - Follow deployment guide
6. **Monitor production** - Check cron logs in Vercel dashboard

---

## 💡 Tips for Quality Briefs

To get better AI-generated briefs:

1. **Use descriptive meeting titles** - "Q4 Planning Call" better than "Meeting"
2. **Add meeting descriptions** - Context helps the AI
3. **Have email history** - More emails = better context
4. **Use real communication patterns** - Test with actual work emails
5. **Include multiple attendees** - More context from different threads

---

## 🔧 Quick Test Commands (Copy-Paste)

Save these in a text file for quick testing:

```javascript
// 1. Check status
fetch('/api/meeting-prep/status').then(r=>r.json()).then(console.log)

// 2. Sync calendar
fetch('/api/meeting-prep/sync',{method:'POST'}).then(r=>r.json()).then(console.log)

// 3. List meetings
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list_meetings'})}).then(r=>r.json()).then(d=>{console.log(d);window.testMeetingId=d.meetings[0].id})

// 4. Generate brief (use meeting ID from step 3)
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate_brief',params:{meetingId:window.testMeetingId}})}).then(r=>r.json()).then(console.log)

// 5. Send email
fetch('/api/meeting-prep/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send_email',params:{briefId:window.testMeetingId}})}).then(r=>r.json()).then(console.log)
```

---

Good luck with testing! 🚀

