# 🔧 SETUP YOUR ENVIRONMENT VARIABLES

## ⚠️ **THE PROBLEM:**
Your `.env.local` file doesn't exist! That's why the waitlist is stuck.

---

## ✅ **THE FIX (2 minutes):**

### **Step 1: Create `.env.local` file**
In your project root (`C:\Users\b-kap\foldera-ai\`), create a file called `.env.local`

---

### **Step 2: Copy this into `.env.local`:**

```bash
# ===== SUPABASE (REQUIRED) =====
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...YOUR_SERVICE_ROLE_KEY

# ===== NEXTAUTH (REQUIRED) =====
NEXTAUTH_SECRET=g57PjvzbZUo+7AYUVR71LAcKmlv//yWZnw3//zezGPI=
NEXTAUTH_URL=http://localhost:3000

# ===== OPTIONAL (Skip for now) =====
# RESEND_API_KEY=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# ANTHROPIC_API_KEY=
```

---

### **Step 3: Get Your Supabase Keys**

1. Go to: https://supabase.com/dashboard
2. Click your project
3. Click **Settings** (gear icon, bottom left)
4. Click **API** in the left menu
5. You'll see:
   - **Project URL** → Copy this to `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys:**
     - `anon` `public` → Copy to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` `secret` → Copy to `SUPABASE_SERVICE_ROLE_KEY`

---

### **Step 4: Save and Restart**

1. Save `.env.local`
2. Stop the dev server (Ctrl+C in terminal)
3. Run `pnpm dev` again
4. Try the waitlist form!

---

## 🎯 **Quick Copy-Paste Version:**

**Create file:** `C:\Users\b-kap\foldera-ai\.env.local`

**Paste this, then replace YOUR_PROJECT_ID and the keys:**

```
NEXT_PUBLIC_SUPABASE_URL=https://neydszeamsfligphthue.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=GET_FROM_SUPABASE_DASHBOARD
SUPABASE_SERVICE_ROLE_KEY=GET_FROM_SUPABASE_DASHBOARD
NEXTAUTH_SECRET=g57PjvzbZUo+7AYUVR71LAcKmlv//yWZnw3//zezGPI=
NEXTAUTH_URL=http://localhost:3000
```

**Your Supabase project ID is:** `neydszeamsfligphthue` (I can see it in your screenshot)

So your URL is: `https://neydszeamsfligphthue.supabase.co`

---

## 📍 **WHERE TO GET SUPABASE KEYS:**

Go here: https://supabase.com/dashboard/project/neydszeamsfligphthue/settings/api

Copy the two keys and paste into `.env.local`!

---

## ✅ **AFTER YOU DO THIS:**

Your waitlist will work instantly! The form will submit in milliseconds instead of hanging.

You're literally 2 minutes from a working waitlist. 🚀


