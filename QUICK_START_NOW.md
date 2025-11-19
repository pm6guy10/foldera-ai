# 🚀 GET FOLDERA WORKING - ACTION PLAN

## ✅ **What's Already Working:**
- Landing page (looks beautiful! ✨)
- Code is production-ready
- Dev server running on http://localhost:3000

## 🎯 **What You Need to Do RIGHT NOW:**

### **Step 1: Run Database Migration** (2 minutes) 🔥

You have 2 SQL files that need to run in Supabase:

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor
2. Click **SQL Editor** in left sidebar
3. Click **New Query**
4. Copy/paste the content from:
   - `supabase/migrations/20250112_waitlist.sql` ← **DO THIS ONE FIRST**
5. Click **Run**
6. You should see: "Success. No rows returned"

**That's it!** Your waitlist form will now work! 🎉

### **Step 2: Test the Waitlist** (30 seconds)

1. Go to: http://localhost:3000
2. Scroll to bottom
3. Enter your email in "Join the waitlist" form
4. Click "Join waitlist"
5. You should see success message!

Check Supabase:
- Go to **Table Editor** → `waitlist` table
- You should see your email with `early_bird_pricing = true` and `committed_price = 47.00`

---

## 📋 **What Works After Step 1:**
- ✅ Landing page
- ✅ Waitlist signup (stores to database)
- ✅ Early-bird pricing tracking (first 100 get $47/mo)

## 📋 **What DOESN'T Work Yet:**
- ❌ Confirmation emails (needs Resend API key)
- ❌ Google OAuth login (needs Google setup)
- ❌ AI brief generation (needs Anthropic API key)

---

## 🎯 **Next Steps (After Waitlist Works):**

### **Phase 2: Get Confirmation Emails Working** (5 mins)
1. Sign up for Resend: https://resend.com/signup
2. Get API key (free tier: 100 emails/day)
3. Add to `.env.local`:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   ```
4. Restart dev server
5. Test signup again → you'll get confirmation email! 📧

### **Phase 3: Get Google OAuth Working** (15 mins)
This allows users to:
- Connect their Google Calendar
- Connect their Gmail
- See upcoming meetings

Steps:
1. Go to: https://console.cloud.google.com/
2. Create new project (or use existing)
3. Enable APIs:
   - Google Calendar API
   - Gmail API
4. Create OAuth 2.0 credentials
5. Set redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID + Secret
7. Add to `.env.local`:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### **Phase 4: Get AI Briefs Working** (2 mins)
1. Sign up for Anthropic: https://console.anthropic.com/
2. Get API key
3. Add to `.env.local`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```

---

## 🎯 **FOCUS TODAY:**

**Just do Step 1** (run the SQL migration). That gets your waitlist working!

You can collect emails immediately and worry about:
- Email confirmations later (Phase 2)
- Google login later (Phase 3)
- AI features later (Phase 4)

---

## 📝 **Your Complete `.env.local` Template:**

```bash
# ===== SUPABASE (You already have this) ✅ =====
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ===== NEXTAUTH ✅ =====
NEXTAUTH_SECRET=g57PjvzbZUo+7AYUVR71LAcKmlv//yWZnw3//zezGPI=
NEXTAUTH_URL=http://localhost:3000

# ===== PHASE 2: Email Confirmations (Optional for now) =====
# RESEND_API_KEY=re_xxxxx

# ===== PHASE 3: Google OAuth (Optional for now) =====
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# ===== PHASE 4: AI Briefs (Optional for now) =====
# ANTHROPIC_API_KEY=sk-ant-xxxxx
```

---

## 🔥 **TL;DR - DO THIS NOW:**

1. Open Supabase SQL Editor
2. Copy/paste content from `supabase/migrations/20250112_waitlist.sql`
3. Click Run
4. Go to http://localhost:3000
5. Test the waitlist form at bottom

**That's it! You'll have a working waitlist in 2 minutes!** 🚀

---

## ❓ **Questions?**

- **Where's my Supabase project?** → https://supabase.com/dashboard
- **How do I find my project ID?** → It's in your Supabase URL: `https://xxxxx.supabase.co`
- **What if the migration fails?** → Share the error message!


