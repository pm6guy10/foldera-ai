# 🚀 Foldera Meeting Prep MVP - Setup Guide

## Overview

This guide will walk you through setting up the complete Foldera Meeting Prep system from scratch.

**Time to complete:** ~30-45 minutes  
**Difficulty:** Intermediate

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Google Cloud Setup](#google-cloud-setup)
5. [Anthropic API Setup](#anthropic-api-setup)
6. [Resend Email Setup](#resend-email-setup)
7. [Local Development](#local-development)
8. [Deployment to Vercel](#deployment-to-vercel)
9. [Testing Checklist](#testing-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- [x] Node.js 18+ installed
- [x] pnpm or npm installed
- [x] Supabase account (you already have this!)
- [x] Vercel account (for deployment)
- [x] Google Cloud account
- [x] Anthropic API access
- [x] Resend account

---

## Environment Variables

### Required Variables

Copy `.env.meeting-prep.example` to `.env.local` and fill in:

```bash
# Database (from Supabase)
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
NEXTAUTH_SECRET=  # Generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Anthropic
ANTHROPIC_API_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=briefings@foldera.ai

# Cron Security
CRON_SECRET=  # Generate: openssl rand -hex 32
```

---

## Database Setup

### 1. Run Migration

The database schema is in `supabase/migrations/20250112000000_meeting_prep_system.sql`.

**Option A: Using Supabase CLI** (Recommended)

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migration
supabase db push
```

**Option B: Via Supabase Dashboard**

1. Go to https://app.supabase.com
2. Select your project
3. Go to **SQL Editor**
4. Paste the contents of the migration file
5. Click **Run**

### 2. Verify Tables

Check that these tables were created:
- `meeting_prep_users`
- `meetings`
- `briefs`
- `emails_cache`
- `sync_logs`

### 3. Get API Keys

From Supabase Dashboard → Settings → API:
- Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Copy **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this secret!

---

## Google Cloud Setup

### 1. Create Project

1. Go to https://console.cloud.google.com
2. Create new project: "Foldera Meeting Prep"
3. Note the project ID

### 2. Enable APIs

Enable these APIs in **APIs & Services** → **Library**:
- Google Calendar API
- Gmail API
- Google People API (for user info)

### 3. Create OAuth Credentials

**APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**

**Application type:** Web application

**Name:** Foldera Meeting Prep

**Authorized redirect URIs:**
```
http://localhost:3000/api/auth/callback/google
https://foldera.ai/api/auth/callback/google
```

**Copy the credentials:**
- Client ID → `GOOGLE_CLIENT_ID`
- Client Secret → `GOOGLE_CLIENT_SECRET`

### 4. Configure OAuth Consent Screen

**OAuth consent screen** → **External** (or Internal if workspace)

**Required info:**
- App name: Foldera
- User support email: your@email.com
- Developer contact: your@email.com

**Scopes to add:**
```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

**Test users:** Add your email for testing (if app is not published)

### 5. Publish App (Optional)

For production, submit app for verification. During development, stay in "Testing" mode.

---

## Anthropic API Setup

### 1. Get API Key

1. Go to https://console.anthropic.com
2. Sign up / Log in
3. Go to **API Keys** → **Create Key**
4. Copy key → `ANTHROPIC_API_KEY`

### 2. Add Credits

Add payment method and credits for API usage.

**Estimated costs for testing:**
- ~$0.01-0.05 per brief
- 100 briefs ≈ $1-5

### 3. Choose Model

Default: `claude-3-5-sonnet-20241022` (best quality/price ratio)

Optional: Set `ANTHROPIC_MODEL` env var to use different model

---

## Resend Email Setup

### 1. Create Account

1. Go to https://resend.com
2. Sign up / Log in

### 2. Get API Key

**API Keys** → **Create API Key**
- Copy key → `RESEND_API_KEY`

### 3. Domain Setup

**For Testing (no domain needed):**
```bash
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**For Production (custom domain):**

1. **Domains** → **Add Domain**
2. Enter your domain: `foldera.ai`
3. Add DNS records to your domain:
   - SPF record
   - DKIM record
   - DMARC record
4. Wait for verification (~10 mins)
5. Set: `RESEND_FROM_EMAIL=briefings@foldera.ai`

---

## Local Development

### 1. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 2. Start Dev Server

```bash
pnpm dev
# or
npm run dev
```

Visit: http://localhost:3000

### 3. Test Auth Flow

1. Go to http://localhost:3000/dashboard
2. Click "Connect Google Calendar"
3. Authorize the app
4. You should see your calendar connection status

### 4. Test Sync

```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/meetings/sync \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie"
```

Or use the dashboard UI sync button.

### 5. Test Brief Generation

Navigate to a meeting in the dashboard and click "Generate Brief"

---

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Add meeting prep MVP"
git push origin main
```

### 2. Import to Vercel

1. Go to https://vercel.com
2. **New Project** → Import your repo
3. **Framework Preset:** Next.js
4. Click **Deploy**

### 3. Add Environment Variables

In Vercel Dashboard → **Settings** → **Environment Variables**

Add ALL variables from `.env.local`:
- Database URLs
- Auth secrets
- API keys
- etc.

⚠️ **Important:** Set for **Production**, **Preview**, and **Development** environments

### 4. Configure Cron

Create `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-calendar",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/sync-gmail",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/generate-briefs",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 5. Redeploy

```bash
vercel --prod
```

### 6. Update Google OAuth

Add production redirect URI in Google Cloud Console:
```
https://foldera.vercel.app/api/auth/callback/google
```
(Or your custom domain)

---

## Testing Checklist

Follow these steps to verify everything works:

### ✅ Database

- [ ] All tables created successfully
- [ ] RLS policies enabled
- [ ] Can query tables via Supabase dashboard

### ✅ Authentication

- [ ] OAuth flow completes
- [ ] User record created in `meeting_prep_users`
- [ ] Tokens stored (check they're encrypted)
- [ ] Can access protected routes after login

### ✅ Google Calendar Sync

- [ ] Manual sync button works
- [ ] Meetings appear in database
- [ ] Attendees correctly parsed
- [ ] Duplicate events not created on re-sync
- [ ] Check `sync_logs` table for results

### ✅ Gmail Sync

- [ ] Emails cached in database
- [ ] Can query emails by attendee
- [ ] Emails deduplicated by `gmail_message_id`
- [ ] Check `sync_logs` table

### ✅ Brief Generation

- [ ] AI generates brief for test meeting
- [ ] Brief contains all sections
- [ ] Brief saved to database
- [ ] Meeting marked as `brief_generated=true`
- [ ] Generation time reasonable (<30s)

### ✅ Email Delivery

- [ ] Brief email sent successfully
- [ ] Email renders correctly (HTML + plain text)
- [ ] Links work
- [ ] `brief.sent_at` timestamp set
- [ ] Check Resend dashboard for delivery status

### ✅ Cron Jobs

- [ ] Cron endpoints return 200
- [ ] Protected by `CRON_SECRET`
- [ ] Run on schedule in production
- [ ] Check Vercel logs for cron execution
- [ ] Briefs sent automatically before meetings

### ✅ End-to-End Flow

**Complete User Journey:**

1. [ ] User signs up / logs in
2. [ ] Connects Google Calendar + Gmail
3. [ ] Calendar syncs (meetings appear)
4. [ ] Gmail syncs (emails cached)
5. [ ] Brief auto-generates 30min before meeting
6. [ ] Brief email delivered
7. [ ] User can view brief in dashboard
8. [ ] After meeting, can provide feedback

---

## Troubleshooting

### Issue: OAuth Flow Fails

**Symptoms:** Redirect URI mismatch error

**Solution:**
1. Check `NEXTAUTH_URL` matches your current URL
2. Verify redirect URI in Google Cloud Console
3. Make sure protocol (http/https) matches

### Issue: No Meetings Syncing

**Symptoms:** Sync completes but 0 meetings

**Possible causes:**
1. No upcoming meetings in calendar
2. All meetings are single-person (no attendees)
3. Token expired (check token expiry)
4. Insufficient scopes (re-authorize)

**Debug:**
```typescript
// Check sync logs
SELECT * FROM sync_logs 
WHERE sync_type = 'calendar' 
ORDER BY started_at DESC 
LIMIT 5;
```

### Issue: Briefs Not Generating

**Symptoms:** Cron runs but no briefs created

**Check:**
1. Are there meetings in next 30-90 minutes?
2. Do meetings have `brief_generated=false`?
3. Check `brief_generation_error` field
4. Verify Anthropic API key is valid
5. Check API quota/credits

**Debug query:**
```sql
SELECT * FROM meetings_needing_briefs;
```

### Issue: Emails Not Sending

**Symptoms:** Brief generated but not sent

**Check:**
1. Resend API key valid
2. From email verified (or using resend.dev)
3. Check Resend dashboard for bounces/errors
4. Verify user email is valid
5. Check spam folder

### Issue: Token Expired

**Symptoms:** 401 errors from Google APIs

**Solution:**
Token refresh should happen automatically. If not:
1. Check `google_refresh_token` is saved
2. Verify token refresh logic in `/lib/google.ts`
3. Force re-authorization if needed

### Issue: High Anthropic Costs

**Solutions:**
1. Use `claude-3-haiku` for cheaper briefs
2. Limit email context (fewer emails sent to AI)
3. Cache brief results longer
4. Implement rate limiting per user

---

## Performance Optimization

### Database Indexes

Already included in migration, but verify:
```sql
\d+ meetings  -- Check indexes
\d+ emails_cache
```

### Caching

Consider adding:
- Redis for session storage
- Brief result caching (avoid regenerating)
- Email context caching

### Rate Limiting

Implement per-user limits:
- Max 10 brief generations per day
- Max 1 sync per 5 minutes

### Monitoring

Set up:
- Sentry for error tracking
- Vercel Analytics for performance
- Supabase logs for query performance

---

## Next Steps

Once MVP is working:

1. **Add Slack integration** - Send briefs to Slack
2. **Mobile notifications** - Push notifications
3. **Feedback system** - Rate briefs, improve prompts
4. **Analytics dashboard** - Track usage, popular features
5. **Team accounts** - Share briefs with team
6. **Calendar write** - Add brief notes to calendar events
7. **Meeting outcomes** - Track what happened in meeting
8. **AI improvements** - Fine-tune prompts, add context

---

## Support

If you get stuck:

1. Check the error logs (Vercel + Supabase)
2. Review this guide's troubleshooting section
3. Check the `/docs` folder for component-specific docs
4. Reach out on the team Slack

---

## Security Notes

⚠️ **Critical:**

1. Never commit `.env.local` to git
2. Rotate API keys regularly
3. Use service role key ONLY on server
4. Encrypt sensitive data at rest
5. Implement rate limiting in production
6. Monitor for suspicious activity
7. Keep dependencies updated

---

## License

Proprietary - Foldera, Inc. © 2025


