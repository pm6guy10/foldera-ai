# Waitlist System Setup Guide

## Environment Variables

Create a `.env.local` file in your project root with these variables:

```bash
# Supabase Configuration
# Get these from: https://app.supabase.com/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Resend API Configuration
# Get this from: https://resend.com/api-keys
RESEND_API_KEY=re_your_api_key_here
```

## Setup Steps

### 1. Supabase Setup

1. Go to https://supabase.com and create a new project
2. Wait for the project to be provisioned (2-3 minutes)
3. Go to **Settings → API** to get your credentials:
   - Copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy the **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

4. Run the migration:
   ```bash
   # Option A: Using Supabase CLI (recommended)
   npx supabase db push
   
   # Option B: Manually in Supabase Dashboard
   # Go to SQL Editor and paste contents of:
   # supabase/migrations/20250111000000_create_waitlist_table.sql
   ```

### 2. Resend Setup

1. Go to https://resend.com and create an account
2. Go to **API Keys** and create a new key
3. Copy the key → `RESEND_API_KEY`

4. **Domain Setup** (for production):
   - Go to **Domains** and add your domain
   - Add the DNS records to your domain provider
   - Wait for verification
   - Update the `from` email in `/app/api/waitlist/route.ts` to use your domain

5. **For Testing** (no domain needed):
   - Change the `from` email to: `onboarding@resend.dev`
   - Resend allows this for testing without domain verification

### 3. Install Dependencies

```bash
npm install @supabase/supabase-js resend
```

### 4. Test the API

```bash
# Start your dev server
npm run dev

# Test the endpoint (in another terminal)
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

## Verification

1. Check Supabase Dashboard → Table Editor → `waitlist` table
2. Check your email inbox for the confirmation
3. Check Resend Dashboard → Logs to see email delivery status

## Resend Email Domain Configuration

For production, you'll want to use your own domain:

1. In Resend Dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `context.app`)
4. Add the DNS records Resend provides to your domain:
   - SPF record
   - DKIM record
   - DMARC record
5. Wait for verification (usually 5-10 minutes)
6. Update the `from` field in the API route:
   ```typescript
   from: 'Context <onboarding@yourdomain.com>',
   ```

## Testing Without Domain (Development)

For development, you can use Resend's test domain:

```typescript
from: 'Context <onboarding@resend.dev>',
to: email, // Make sure to use your own email for testing
```

## Monitoring

- **Supabase**: Check the `waitlist` table in the Supabase dashboard
- **Resend**: Check the Logs section to see all sent emails
- **Server Logs**: Check your terminal for any API errors

## Troubleshooting

### Email not sending
- Check RESEND_API_KEY is correct
- Verify domain is verified in Resend (or use resend.dev for testing)
- Check Resend logs for delivery errors

### Database errors
- Verify SUPABASE_SERVICE_ROLE_KEY (not anon key)
- Check migration ran successfully
- Verify table exists in Supabase dashboard

### Duplicate email errors
- Expected behavior! User is already on the list
- Returns 409 status with message: "You're already on the list"

## Production Deployment (Vercel)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel Dashboard:
   - Settings → Environment Variables
   - Add all three variables from `.env.local`
4. Deploy!

## Rate Limiting (Recommended for Production)

Consider adding rate limiting to prevent abuse:

```bash
npm install @upstash/ratelimit @upstash/redis
```

Then wrap your API route with rate limiting logic.


