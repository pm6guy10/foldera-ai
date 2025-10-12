# ⚡ Quick Start - Test Meeting Prep in 10 Minutes

Follow these steps to test the complete meeting prep flow:

---

## ✅ Pre-flight Checklist

1. **Environment variables set in `.env.local`:**
   ```bash
   # Check these exist:
   NEXT_PUBLIC_SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ANTHROPIC_API_KEY=
   RESEND_API_KEY=
   ```

2. **Database migration run:**
   ```bash
   # Check in Supabase dashboard that these tables exist:
   - meeting_prep_users
   - meetings
   - briefs
   - emails_cache
   - sync_logs
   ```

3. **Test calendar events created** (in your Google Calendar):
   - At least 1 meeting in next 7 days
   - Meeting must have attendees (fake emails OK)

---

## 🚀 Testing Steps

### 1. Start Server

```bash
cd c:\Users\b-kap\foldera-ai
pnpm dev
```

Visit: http://localhost:3000

---

### 2. Sign in with Google

1. Go to http://localhost:3000/dashboard
2. Click "Sign in with Google"
3. Grant all permissions (calendar + email)
4. You should land back on dashboard

---

### 3. Open Browser Console

Press `F12` → Console tab

---

### 4. Sync Calendar (Copy-paste this)

```javascript
fetch('/api/meeting-prep/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Sync complete:', data);
    console.log(`Found ${data.meetings_synced} meetings`);
  })
```

**Expected:** `meetings_synced: 1` (or more)

---

### 5. List Meetings (Copy-paste this)

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
      const meeting = data.meetings[0];
      console.log('\n🎯 First meeting:');
      console.log('  Title:', meeting.title);
      console.log('  ID:', meeting.id);
      console.log('  Time:', new Date(meeting.start_time).toLocaleString());
      
      // Save for next step
      window.testMeetingId = meeting.id;
      console.log('\n✅ Saved meeting ID for testing');
    }
  })
```

**Copy the meeting ID** shown in output!

---

### 6. Generate Brief (Copy-paste this)

```javascript
// Make sure window.testMeetingId is set from previous step
// Or manually set it: window.testMeetingId = 'YOUR_MEETING_ID'

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
      console.log('✅ Brief generated!');
      console.log('\n📋 BRIEF CONTENT:\n');
      
      const brief = data.brief.content;
      
      console.log('🔑 KEY CONTEXT:');
      brief.key_context.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n💡 WHAT TO SAY:');
      brief.what_to_say.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n⚠️ WHAT TO AVOID:');
      brief.what_to_avoid.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log('\n🔄 OPEN THREADS:');
      brief.open_threads.forEach((item, i) => 
        console.log(`  ${i+1}. ${item}`)
      );
      
      console.log(`\n⏱️ Generated in ${data.generationTime}ms`);
      
      // Save for email test
      window.testBriefId = window.testMeetingId;
    } else {
      console.error('❌ Failed:', data.message);
    }
  })
```

**Check the brief content** - does it make sense?

---

### 7. Send Test Email (Copy-paste this)

```javascript
fetch('/api/meeting-prep/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'send_email',
    params: { briefId: window.testBriefId }
  })
})
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      console.log('✅ Email sent!');
      console.log('📧 Message ID:', data.messageId);
      console.log('\n👉 Check your inbox for the brief email!');
    } else {
      console.error('❌ Failed:', data.message);
    }
  })
```

**Check your email inbox** - you should receive the brief!

---

## ✅ Success Criteria

After running all steps, you should have:

- [x] Authenticated with Google
- [x] Calendar synced (meetings in database)
- [x] Brief generated with AI
- [x] Brief contains relevant suggestions
- [x] Email sent successfully
- [x] Email received in inbox
- [x] Email formatting looks good

---

## 🐛 Common Issues

### "Unauthorized" errors
→ Sign in again: http://localhost:3000/dashboard

### "Meeting not found"
→ Run step 5 again to get correct meeting ID

### Brief generation fails
→ Check Anthropic API key and credits

### Email not received
→ Check spam folder  
→ Verify `RESEND_API_KEY` is set  
→ Use `onboarding@resend.dev` for testing

---

## 📚 Next Steps

Once this works:

1. **Read full testing guide:** `docs/TESTING_GUIDE.md`
2. **Add email context:** Create test email threads
3. **Test cron jobs:** See automated flow
4. **Deploy to Vercel:** Production testing

---

## 🆘 Need Help?

Check detailed troubleshooting in `docs/TESTING_GUIDE.md`

Or review setup: `docs/MEETING_PREP_SETUP.md`

---

**Total time: ~10 minutes** ⚡

Good luck! 🚀

