# 🎯 Foldera Meeting Prep MVP - Complete Documentation

## 📖 Overview

Foldera Meeting Prep is an AI-powered system that automatically briefs users before meetings by analyzing their calendar, emails, and communication history.

**How it works:**
1. Connects to user's Google Calendar + Gmail
2. Before each meeting (30 min prior), AI analyzes context
3. Generates intelligent brief with key context, talking points, and things to avoid
4. Delivers brief via email (or Slack in future)
5. User walks into meeting fully prepared

---

## 🏗️ Architecture

### Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes + Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL)
- **Authentication:** NextAuth.js + Google OAuth
- **AI:** Anthropic Claude 3.5 Sonnet
- **Email:** Resend
- **Hosting:** Vercel
- **Cron Jobs:** Vercel Cron

### System Components

```
┌─────────────────────────────────────────────────────┐
│                   USER                               │
│  (Google Calendar + Gmail)                          │
└────────────────┬────────────────────────────────────┘
                 │
                 │ OAuth + API Access
                 │
┌────────────────▼────────────────────────────────────┐
│            FOLDERA MEETING PREP                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         NextAuth.js OAuth                     │  │
│  │    (Token Management + Refresh)               │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                  │
│  ┌────────────────▼─────────────────────────────┐  │
│  │     ORCHESTRATOR (Cron Jobs)                  │  │
│  │  - Calendar Sync (every 15 min)               │  │
│  │  - Gmail Sync (every 30 min)                  │  │
│  │  - Brief Generation (every 5 min)             │  │
│  └────┬─────────────────────────────────────┬───┘  │
│       │                                     │       │
│  ┌────▼──────────┐  ┌────────────┐  ┌─────▼────┐  │
│  │ Google        │  │ Gmail      │  │ Brief    │  │
│  │ Calendar      │  │ Cache      │  │ Generator│  │
│  │ Integration   │  │            │  │ (Claude) │  │
│  └────┬──────────┘  └────┬───────┘  └─────┬────┘  │
│       │                  │                 │       │
│  ┌────▼──────────────────▼─────────────────▼────┐  │
│  │         SUPABASE DATABASE                     │  │
│  │  - meetings                                   │  │
│  │  - emails_cache                               │  │
│  │  - briefs                                     │  │
│  │  - meeting_prep_users                         │  │
│  │  - sync_logs                                  │  │
│  └────────────────┬──────────────────────────────┘  │
│                   │                                  │
│  ┌────────────────▼──────────────────────────────┐  │
│  │         EMAIL DELIVERY (Resend)               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
foldera-ai/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts      # NextAuth handler
│   │   ├── meeting-prep/
│   │   │   ├── sync/route.ts                # Manual sync endpoint
│   │   │   ├── status/route.ts              # User status
│   │   │   ├── meetings/route.ts            # Get meetings
│   │   │   ├── briefs/
│   │   │   │   ├── [id]/route.ts            # Get brief by ID
│   │   │   │   └── generate/[meetingId]/    # Generate brief
│   │   │   └── test/route.ts                # Test utilities (dev only)
│   │   └── cron/
│   │       ├── sync-calendar/route.ts       # Calendar sync cron
│   │       ├── sync-gmail/route.ts          # Gmail sync cron
│   │       └── generate-briefs/route.ts     # Brief generation cron
│   └── dashboard/                            # User dashboard (TODO)
│
├── lib/
│   └── meeting-prep/
│       ├── auth.ts                          # Auth helpers + NextAuth config
│       ├── google-calendar.ts               # Calendar integration
│       ├── gmail.ts                         # Gmail integration
│       ├── brief-generator.ts               # AI brief generation
│       ├── email.ts                         # Email sending
│       ├── orchestrator.ts                  # Main workflow coordinator
│       └── test-helpers.ts                  # Testing utilities
│
├── types/
│   └── meeting-prep.ts                      # TypeScript type definitions
│
├── supabase/
│   └── migrations/
│       └── 20250112000000_meeting_prep_system.sql  # Database schema
│
├── docs/
│   ├── MEETING_PREP_SETUP.md                # Complete setup guide
│   ├── TESTING_GUIDE.md                     # End-to-end testing guide
│   ├── QUICK_START_TESTING.md               # 10-minute quick start
│   └── MEETING_PREP_README.md               # This file
│
└── vercel.json                               # Vercel config + cron jobs
```

---

## 🗄️ Database Schema

### Tables

**`meeting_prep_users`**
- User data + Google OAuth tokens
- Settings/preferences
- Last sync timestamps

**`meetings`**
- Calendar events synced from Google Calendar
- Meeting details (title, time, attendees)
- Brief generation status

**`briefs`**
- AI-generated meeting briefs
- Structured content (key context, what to say, etc.)
- Delivery tracking (sent_at, opened_at)

**`emails_cache`**
- Gmail emails cached for context
- Indexed by attendee emails for fast lookup
- Used to provide context to AI

**`sync_logs`**
- Audit log of all sync operations
- Used for debugging and monitoring

### Key Relationships

```
meeting_prep_users (1) ──< (many) meetings
meeting_prep_users (1) ──< (many) emails_cache
meetings (1) ──< (many) briefs
```

---

## 🔄 Data Flow

### 1. User Onboarding

```
User → Sign in with Google → NextAuth OAuth
  ↓
Grant permissions (Calendar + Gmail)
  ↓
Store tokens in meeting_prep_users table
  ↓
Ready for sync!
```

### 2. Calendar Sync (Every 15 minutes)

```
Cron Job → Fetch all users with Google connection
  ↓
For each user:
  ↓
Get access token (refresh if expired)
  ↓
Call Google Calendar API (next 7 days)
  ↓
Filter: only meetings with attendees
  ↓
Upsert to meetings table (by google_event_id)
  ↓
Log sync results
```

### 3. Gmail Sync (Every 30 minutes)

```
Cron Job → For each user
  ↓
Get last sync time
  ↓
Fetch new emails since last sync
  ↓
Parse: from, to, subject, body
  ↓
Insert to emails_cache (dedupe by gmail_message_id)
  ↓
Log results
```

### 4. Brief Generation (Every 5 minutes)

```
Cron Job → Query: meetings in next 30-90 min
  ↓
Filter: brief_generated = false
  ↓
For each meeting:
  ↓
Get attendee emails
  ↓
Query emails_cache for relevant emails (last 90 days)
  ↓
Build prompt with meeting + email context
  ↓
Call Claude API
  ↓
Parse JSON response → BriefContent
  ↓
Save to briefs table
  ↓
Mark meeting as brief_generated = true
  ↓
Send email via Resend
  ↓
Mark brief as sent
```

---

## 🧠 AI Prompt Strategy

### Context Provided to Claude

1. **Meeting Details:**
   - Title, time, location
   - Attendee list
   - Description

2. **Recent Email History:**
   - Last 10-20 emails with attendees
   - From last 90 days
   - Subject, date, body preview

3. **Instructions:**
   - Be specific (reference dates, details)
   - Surface forgotten commitments
   - Flag sensitive topics
   - Keep concise

### Output Format (JSON)

```json
{
  "key_context": [
    "Specific facts user should remember"
  ],
  "what_to_say": [
    "Suggested talking points based on history"
  ],
  "what_to_avoid": [
    "Sensitive topics or recent issues"
  ],
  "open_threads": [
    "Pending items or promises"
  ],
  "relationship_notes": "Overall relationship context"
}
```

---

## 📧 Email Delivery

### Brief Email Contains:

- Meeting title & time
- Time until meeting ("in 45 minutes")
- Attendee list
- Key context section
- What to say section
- What to avoid section
- Open threads section
- Relationship notes

### Email Formats:

- **HTML:** Nicely styled with sections and emojis
- **Plain text:** Fallback for email clients

### Delivery:

- Sent via Resend API
- From: `briefings@foldera.ai` (or `onboarding@resend.dev` for testing)
- Tracks: sent_at, opened_at (future)

---

## ⏰ Cron Jobs (Vercel)

### Calendar Sync
- **Schedule:** Every 15 minutes (`*/15 * * * *`)
- **Endpoint:** `/api/cron/sync-calendar`
- **Function:** Syncs Google Calendar for all users

### Gmail Sync
- **Schedule:** Every 30 minutes (`*/30 * * * *`)
- **Endpoint:** `/api/cron/sync-gmail`
- **Function:** Syncs Gmail for all users

### Brief Generation
- **Schedule:** Every 5 minutes (`*/5 * * * *`)
- **Endpoint:** `/api/cron/generate-briefs`
- **Function:** Generates and sends briefs for meetings 30-90 min away

### Security:

All cron endpoints protected by `CRON_SECRET` in Authorization header.

---

## 🔐 Security & Privacy

### Data Protection

1. **OAuth Tokens:**
   - Stored in database (should be encrypted in production)
   - Refresh tokens used to regenerate access tokens
   - Never exposed to client

2. **Row Level Security:**
   - All tables have RLS policies
   - Users can only access their own data
   - Service role bypasses RLS for cron jobs

3. **API Protection:**
   - All endpoints require NextAuth session
   - User ID verified on every request
   - Cron endpoints protected by secret

### Data Retention

- **Emails:** Cached for context (90 days lookback)
- **Meetings:** Kept indefinitely for history
- **Briefs:** Kept for user reference
- **Sync logs:** Can be pruned periodically

### Privacy Notes

- Read-only access to Calendar + Gmail
- Never writes to user's accounts
- Data used only for brief generation
- Can be deleted on user request

---

## 📊 Performance & Scaling

### Current Limitations (MVP)

- **Email sync:** Sequential (slow for large mailboxes)
- **Brief generation:** Sequential per user
- **No caching:** Regenerates briefs every time
- **Single region:** Vercel default region

### Optimization Opportunities

1. **Batch Gmail API requests** - Fetch multiple emails in parallel
2. **Cache brief results** - Don't regenerate if already exists
3. **Redis for sessions** - Faster auth checks
4. **Incremental sync** - Only fetch new data
5. **Background jobs** - Queue-based processing (Inngest, BullMQ)
6. **CDN for static assets**
7. **Database indexing** - Already included in migration

### Expected Costs (Per User/Month)

- **Supabase:** Free tier (up to 500MB)
- **Anthropic:** ~$0.01-0.05 per brief × 20 meetings = **$0.20-1.00**
- **Resend:** Free tier (3,000 emails/month)
- **Vercel:** Free tier (hobby) or Pro ($20)

**Total:** ~$1-2 per user/month for AI + hosting

---

## 🧪 Testing

### Quick Start (10 minutes)

See: `docs/QUICK_START_TESTING.md`

### Full Testing Guide

See: `docs/TESTING_GUIDE.md`

### Test Checklist

- [ ] OAuth authentication works
- [ ] Calendar syncs successfully
- [ ] Gmail syncs successfully
- [ ] Brief generates with quality content
- [ ] Email sends and looks good
- [ ] Cron jobs execute on schedule
- [ ] Database records are correct

---

## 🚀 Deployment

### Prerequisites

1. All environment variables set in Vercel
2. Database migrated
3. Google OAuth production redirect URIs added
4. Resend domain verified (or using test domain)
5. `vercel.json` cron jobs configured

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Post-Deployment

1. **Test OAuth flow** on production URL
2. **Verify cron jobs** in Vercel dashboard
3. **Monitor logs** for errors
4. **Test complete flow** with real user

---

## 📈 Monitoring & Debugging

### Check Logs

**Vercel Dashboard:**
- Functions → Logs
- Cron → Execution logs

**Supabase Dashboard:**
- Database → Query performance
- Logs → API requests

### Database Queries

```sql
-- Check recent syncs
SELECT * FROM sync_logs 
ORDER BY started_at DESC 
LIMIT 10;

-- Check briefs generated today
SELECT COUNT(*) FROM briefs 
WHERE generated_at::date = CURRENT_DATE;

-- Find failed brief generations
SELECT * FROM meetings 
WHERE brief_generation_error IS NOT NULL;

-- Check email cache size
SELECT COUNT(*), user_id FROM emails_cache 
GROUP BY user_id;
```

### Performance Metrics

```sql
-- Average brief generation time
SELECT 
  AVG(generation_time_ms) as avg_ms,
  AVG(ai_tokens_used) as avg_tokens
FROM briefs;

-- Sync success rate
SELECT 
  sync_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
FROM sync_logs
GROUP BY sync_type;
```

---

## 🛠️ Future Enhancements

### Phase 2 Features

- [ ] **Slack integration** - Send briefs to Slack
- [ ] **Mobile app** - iOS/Android push notifications
- [ ] **Meeting outcomes** - Track what happened, improve AI
- [ ] **Team accounts** - Share briefs with team
- [ ] **Calendar write** - Add brief notes to calendar event
- [ ] **Feedback system** - Rate briefs, improve prompts
- [ ] **Analytics dashboard** - Usage stats, ROI tracking

### Technical Improvements

- [ ] **Webhook-based sync** - Real-time updates instead of polling
- [ ] **Background job queue** - More robust processing
- [ ] **Token encryption** - Encrypt OAuth tokens at rest
- [ ] **Rate limiting** - Per-user API limits
- [ ] **Error alerting** - Sentry integration
- [ ] **E2E tests** - Automated testing
- [ ] **Multi-region** - Global deployment

---

## 📚 Documentation Index

- **[Setup Guide](./MEETING_PREP_SETUP.md)** - Complete setup instructions
- **[Testing Guide](./TESTING_GUIDE.md)** - End-to-end testing walkthrough
- **[Quick Start](./QUICK_START_TESTING.md)** - 10-minute test flow
- **[This README](./MEETING_PREP_README.md)** - System overview

---

## 🆘 Support

### Common Issues

See `docs/TESTING_GUIDE.md` → Troubleshooting section

### Need Help?

1. Check error logs (Vercel + Supabase)
2. Review setup documentation
3. Check `sync_logs` table for errors
4. Test with simpler data (fewer emails, basic meetings)

---

## 📄 License

Proprietary - Foldera, Inc. © 2025

---

**Built with ❤️ by the Foldera team**

