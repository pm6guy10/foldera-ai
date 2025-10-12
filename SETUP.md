# 🚀 FOLDERA COMPLETE SETUP GUIDE

This guide will walk you through setting up EVERY environment variable you need. Follow each section in order, and don't skip any steps!

---

## 📋 PREREQUISITES

Before you start, make sure you have:
- [ ] A code editor (VS Code recommended)
- [ ] Terminal/Command Prompt access
- [ ] A web browser
- [ ] Your Anthropic API key (from screenshot)
- [ ] Your Stripe keys (from screenshot)

---

## 🗂️ TABLE OF CONTENTS

1. [Supabase Setup](#1-supabase-setup)
2. [NextAuth Secret](#2-nextauth-secret)
3. [Google OAuth Setup](#3-google-oauth-setup)
4. [Anthropic API (Already Have)](#4-anthropic-api)
5. [Stripe (Already Have)](#5-stripe)
6. [Resend Email Setup](#6-resend-email-setup)
7. [Final Verification](#7-final-verification)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. SUPABASE SETUP

Supabase is your database. You need two values: the URL and the service role key.

### Step-by-Step Instructions:

1. **Open Supabase**
   - Go to: https://app.supabase.com
   - Log in with your account

2. **Select Your Project**
   - You should see your project (probably called "foldera" or similar)
   - Click on it to open

3. **Navigate to API Settings**
   - Look at the LEFT SIDEBAR
   - Click the ⚙️ **Settings** icon (gear icon at the bottom)
   - In the settings menu, click **"API"**

4. **Copy Your Keys**
   - You'll see a section called "Project URL"
   - Copy the URL (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - Open your `.env.local` file
   - Paste it after `NEXT_PUBLIC_SUPABASE_URL=`
   
   - Scroll down to "Project API keys"
   - Find the **"service_role"** key (NOT the "anon" key!)
   - Click the 👁️ eye icon to reveal the key
   - Copy the entire key (it's LONG, starts with `eyJ...`)
   - Paste it after `SUPABASE_SERVICE_ROLE_KEY=`

### What It Should Look Like:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghij.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFz...
```

⚠️ **IMPORTANT:** The service_role key is SECRET. Never share it or commit it to GitHub!

✅ **Done with Supabase!**

---

## 2. NEXTAUTH SECRET

NextAuth needs a random secret to encrypt session tokens. You need to generate a 32-character random string.

### Option A: Using Terminal (Mac/Linux/WSL)

1. Open your terminal
2. Copy and paste this command:
   ```bash
   openssl rand -base64 32
   ```
3. Press Enter
4. Copy the output (looks like random characters)
5. Paste it after `NEXTAUTH_SECRET=` in your `.env.local`

### Option B: Using Online Generator (Any OS)

1. Go to: https://generate-secret.vercel.app/32
2. Copy the generated string
3. Paste it after `NEXTAUTH_SECRET=` in your `.env.local`

### Option C: Manual Random String

If both above fail, just type a random string of letters, numbers, and symbols (at least 32 characters long).

### What It Should Look Like:
```bash
NEXTAUTH_SECRET=ABcd1234XYzw5678!@#$%^&*()_+-=[]
NEXTAUTH_URL=http://localhost:3000
```

The `NEXTAUTH_URL` is already filled in - don't change it for local development!

✅ **Done with NextAuth!**

---

## 3. GOOGLE OAUTH SETUP

This is the longest section, but I'll guide you through every click. Google OAuth allows your app to access Calendar and Gmail.

### Part 1: Create a Google Cloud Project (if you don't have one)

1. **Go to Google Cloud Console**
   - Open: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create or Select Project**
   - At the top of the page, you'll see "Select a project" dropdown
   - If you already have a project, select it
   - If not, click "NEW PROJECT"
     - Project name: `Foldera`
     - Click "CREATE"
     - Wait 10-20 seconds for it to be created
   - Make sure your project is selected (you'll see the name at the top)

### Part 2: Enable Required APIs

1. **Enable Google Calendar API**
   - In the search bar at top, type: "Google Calendar API"
   - Click "Google Calendar API" in the results
   - Click the blue "ENABLE" button
   - Wait for it to enable (5-10 seconds)

2. **Enable Gmail API**
   - Click the back arrow or search again
   - In the search bar, type: "Gmail API"
   - Click "Gmail API" in the results
   - Click the blue "ENABLE" button
   - Wait for it to enable

3. **Enable Google People API**
   - Click the back arrow or search again
   - In the search bar, type: "Google People API"
   - Click "People API" in the results
   - Click the blue "ENABLE" button
   - Wait for it to enable

### Part 3: Configure OAuth Consent Screen

1. **Navigate to OAuth Consent Screen**
   - Click the ☰ hamburger menu (top left)
   - Scroll down and click "APIs & Services"
   - Click "OAuth consent screen" in the left sidebar

2. **Choose User Type**
   - Select **"External"** (unless you have a Google Workspace)
   - Click the blue "CREATE" button

3. **Fill Out App Information** (Page 1 of 4)
   - App name: `Foldera`
   - User support email: Select your email from dropdown
   - App logo: Skip this for now
   - Application home page: Leave blank
   - Authorized domains: Leave blank for now
   - Developer contact information: Enter your email
   - Click "SAVE AND CONTINUE"

4. **Scopes** (Page 2 of 4)
   - Just click "SAVE AND CONTINUE" (we'll handle scopes in code)

5. **Test Users** (Page 3 of 4)
   - Click "+ ADD USERS"
   - Enter YOUR email address (the one you'll use for testing)
   - Click "ADD"
   - Click "SAVE AND CONTINUE"

6. **Summary** (Page 4 of 4)
   - Review and click "BACK TO DASHBOARD"

✅ **OAuth Consent Screen configured!**

### Part 4: Create OAuth Client Credentials

1. **Navigate to Credentials**
   - You should still be in "APIs & Services"
   - Click "Credentials" in the left sidebar

2. **Create OAuth Client ID**
   - Click "+ CREATE CREDENTIALS" at the top
   - Select "OAuth client ID" from dropdown

3. **Configure the OAuth Client**
   - Application type: Select **"Web application"**
   - Name: `Foldera Local Dev`

4. **Add Authorized JavaScript Origins**
   - Under "Authorized JavaScript origins"
   - Click "+ ADD URI"
   - Enter: `http://localhost:3000`

5. **Add Authorized Redirect URIs**
   - Under "Authorized redirect URIs"
   - Click "+ ADD URI" THREE times
   - Enter these EXACTLY (one per field):
     ```
     http://localhost:3000/api/auth/callback/google
     http://localhost:3000/api/auth/google/callback
     http://localhost:3000/api/auth/google/calendar/callback
     ```

6. **Create the Client**
   - Click the blue "CREATE" button at the bottom

7. **Copy Your Credentials**
   - A popup will show your credentials
   - Copy "Your Client ID" (ends with `.apps.googleusercontent.com`)
   - Paste it after `GOOGLE_CLIENT_ID=` in your `.env.local`
   - Copy "Your Client Secret" (starts with `GOCSPX-`)
   - Paste it after `GOOGLE_CLIENT_SECRET=` in your `.env.local`
   - Click "OK" to close the popup

### What It Should Look Like:
```bash
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-AbCdEfGhIjKlMnOpQrStUvWx
```

✅ **Done with Google OAuth!**

---

## 4. ANTHROPIC API

You already have this from your screenshot!

### Instructions:

1. Open your `.env.local` file
2. Find the line: `ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE`
3. Replace `YOUR_KEY_HERE` with your actual key from the screenshot
4. It should start with `sk-ant-api03-`

### If You Need a New Key:

1. Go to: https://console.anthropic.com
2. Log in
3. Click "API Keys" in the left sidebar
4. Click "Create Key"
5. Name it "Foldera"
6. Copy the key and paste it in `.env.local`

### What It Should Look Like:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGh1234567890IjKlMnOp...
```

✅ **Done with Anthropic!**

---

## 5. STRIPE

You already have these from your screenshot!

### Instructions:

1. Open your `.env.local` file
2. Find these three lines:
   ```bash
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
   ```
3. Replace each `YOUR_KEY` and `YOUR_SECRET` with your actual keys from the screenshot

### If You Need to Find Them Again:

1. **API Keys:**
   - Go to: https://dashboard.stripe.com/test/apikeys
   - Copy "Publishable key" (starts with `pk_test_`)
   - Click "Reveal test key" for "Secret key" (starts with `sk_test_`)

2. **Webhook Secret:**
   - Go to: https://dashboard.stripe.com/test/webhooks
   - Click on your webhook endpoint
   - Click "Reveal" under "Signing secret"
   - Copy the key (starts with `whsec_`)

### What It Should Look Like:
```bash
STRIPE_SECRET_KEY=sk_test_51AbCdE...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdE...
STRIPE_WEBHOOK_SECRET=whsec_AbCdEf...
```

✅ **Done with Stripe!**

---

## 6. RESEND EMAIL SETUP

Resend is the email service that sends meeting briefs to users.

### Step-by-Step Instructions:

1. **Sign Up for Resend**
   - Go to: https://resend.com
   - Click "Sign Up" (top right)
   - Enter your email and create a password
   - Verify your email

2. **Create an API Key**
   - After logging in, you'll see the dashboard
   - In the LEFT SIDEBAR, click "API Keys"
   - Click "+ Create API Key" button
   - Name: `Foldera Local Dev`
   - Permission: Select "Sending access" (or "Full access")
   - Click "Add" or "Create"

3. **Copy Your API Key**
   - A popup will show your API key (starts with `re_`)
   - ⚠️ Copy it NOW - you won't be able to see it again!
   - Paste it after `RESEND_API_KEY=` in your `.env.local`

4. **Use Test Email (For Now)**
   - The `.env.local` already has: `RESEND_FROM_EMAIL=onboarding@resend.dev`
   - This is Resend's TEST email address
   - It works WITHOUT domain verification
   - Perfect for development!

### What It Should Look Like:
```bash
RESEND_API_KEY=re_123456789_AbCdEfGhIjKlMnOp
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=Foldera
```

### Later: Verify Your Own Domain (Optional)

Once you're ready for production:

1. Go to Resend Dashboard → "Domains"
2. Click "+ Add Domain"
3. Enter: `foldera.ai`
4. Follow the DNS instructions to verify
5. Change `RESEND_FROM_EMAIL=briefings@foldera.ai`

But for now, stick with `onboarding@resend.dev`!

✅ **Done with Resend!**

---

## 7. FINAL VERIFICATION

Now let's make sure EVERYTHING is set up correctly!

### Checklist

Open your `.env.local` file and verify:

```
✅ ALL VARIABLES HAVE VALUES (no empty ones)
✅ NEXT_PUBLIC_SUPABASE_URL starts with https://
✅ SUPABASE_SERVICE_ROLE_KEY is a long string starting with eyJ
✅ NEXTAUTH_SECRET is at least 32 characters
✅ NEXTAUTH_URL is http://localhost:3000
✅ GOOGLE_CLIENT_ID ends with .apps.googleusercontent.com
✅ GOOGLE_CLIENT_SECRET starts with GOCSPX-
✅ ANTHROPIC_API_KEY starts with sk-ant-api03-
✅ STRIPE_SECRET_KEY starts with sk_test_
✅ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY starts with pk_test_
✅ STRIPE_WEBHOOK_SECRET starts with whsec_
✅ RESEND_API_KEY starts with re_
```

### Test Your Setup

1. **Install Dependencies** (if you haven't already)
   ```bash
   npm install
   ```

2. **Run the Development Server**
   ```bash
   npm run dev
   ```

3. **Open Your App**
   - Go to: http://localhost:3000
   - If it loads without errors, you're good! 🎉

4. **Check for Errors**
   - Look at your terminal for any error messages
   - If you see errors about missing environment variables, go back and check them

---

## 8. TROUBLESHOOTING

### Problem: "Missing environment variable"

**Solution:**
1. Make sure the `.env.local` file is in the ROOT of your project (same folder as `package.json`)
2. Make sure there are NO SPACES before or after the `=` sign
3. Make sure each line is: `KEY=value` (not `KEY= value` or `KEY =value`)
4. Restart your dev server: Stop it (Ctrl+C) and run `npm run dev` again

### Problem: "Google OAuth redirect_uri_mismatch"

**Solution:**
1. Go back to Google Cloud Console → Credentials
2. Click on your OAuth client
3. Double-check ALL THREE redirect URIs are EXACTLY:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/calendar/callback`
4. Make sure there are no trailing slashes or extra characters
5. Save and wait 5 minutes for changes to propagate

### Problem: "Supabase connection failed"

**Solution:**
1. Go to Supabase Dashboard → Settings → API
2. Make sure you copied the **service_role** key, NOT the anon key
3. The service_role key is much longer
4. Copy it again and replace in `.env.local`

### Problem: "Stripe webhook signature verification failed"

**Solution:**
1. For local testing, you need Stripe CLI
2. Or you can test without webhooks initially
3. The webhook secret is only needed for handling payment events

### Problem: "Resend authentication failed"

**Solution:**
1. Go to Resend Dashboard → API Keys
2. Make sure the key has "Sending access" permission
3. If you revealed the key more than once, create a NEW key
4. Delete the old key and use the new one

### Problem: "NextAuth session error"

**Solution:**
1. Delete your browser cookies for localhost:3000
2. Generate a new NEXTAUTH_SECRET:
   ```bash
   openssl rand -base64 32
   ```
3. Replace it in `.env.local`
4. Restart dev server

---

## 🎉 CONGRATULATIONS!

If you made it through all the steps, your Foldera environment is fully configured!

### Next Steps:

1. **Test Authentication:**
   - Try signing in with Google
   - Make sure it connects your calendar

2. **Test Features:**
   - Upload a document
   - Create a case
   - Try the instant audit feature

3. **Monitor Logs:**
   - Keep an eye on your terminal for errors
   - Check Supabase logs for database issues
   - Check Resend logs for email delivery

### Need More Help?

- Supabase Docs: https://supabase.com/docs
- NextAuth Docs: https://next-auth.js.org
- Google OAuth Docs: https://developers.google.com/identity/protocols/oauth2
- Stripe Docs: https://stripe.com/docs
- Resend Docs: https://resend.com/docs

---

## 🔐 SECURITY REMINDERS

- ❌ NEVER commit `.env.local` to git
- ❌ NEVER share your API keys publicly
- ❌ NEVER use test keys in production
- ✅ The `.gitignore` already excludes `.env.local`
- ✅ For production, set env variables in Vercel/hosting dashboard
- ✅ Rotate keys regularly for security

---

**Happy Coding! 🚀**
