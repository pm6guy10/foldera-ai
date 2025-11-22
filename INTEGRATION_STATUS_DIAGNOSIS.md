# Integration Status Diagnosis

## Problem

The UI shows "disconnected" even after a successful OAuth flow because of an **authentication mismatch** between NextAuth and Supabase RLS policies.

## Root Cause

### The Flow:

1. **OAuth Success** (`lib/meeting-prep/auth.ts`):
   - User signs in via NextAuth
   - JWT callback calls `upsertMeetingPrepUser()`
   - Uses **service role key** (`SUPABASE_SERVICE_ROLE_KEY`)
   - Successfully upserts to `meeting_prep_users` table
   - Successfully upserts to `integrations` table (lines 228-263)

2. **UI Check** (`app/dashboard/settings/SettingsClient.tsx`):
   - Uses **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) 
   - Queries `integrations` table directly (line 68-71)
   - **RLS blocks the query** because `auth.uid()` is NULL

### The RLS Policy Issue:

```sql
-- From: supabase/migrations/20250121000000_create_integrations_table.sql
CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_prep_users mpu
      WHERE mpu.id = integrations.user_id
      AND mpu.email = (SELECT email FROM auth.users WHERE id = auth.uid())  -- ❌ This fails!
    )
  );
```

**Problem:** `auth.uid()` requires Supabase Auth session, but users authenticate via **NextAuth** (not Supabase Auth).

## Solutions

### Option 1: Create an API Route (Recommended)

Create `/api/integrations/status` that uses the service role key to bypass RLS:

```typescript
// app/api/integrations/status/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user ID from email
    const { data: user } = await supabase
      .from('meeting_prep_users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (!user) {
      return NextResponse.json({ integrations: [] });
    }

    // Get integrations (service role bypasses RLS)
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id);

    return NextResponse.json({ integrations: integrations || [] });
  } catch (error: any) {
    console.error('[API] Integration status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}
```

Then update `SettingsClient.tsx` to fetch from API:

```typescript
// In SettingsClient.tsx, replace lines 46-79:
const fetchIntegrations = async () => {
  try {
    const response = await fetch('/api/integrations/status');
    if (!response.ok) throw new Error('Failed to fetch');
    const { integrations } = await response.json();
    setIntegrations(integrations || []);
    setLoading(false);
  } catch (err: any) {
    console.error("Fetch error:", err);
    setError(err.message);
    setLoading(false);
  }
};
```

### Option 2: Fix RLS Policy (Alternative)

Modify RLS to check NextAuth session instead of Supabase Auth:

```sql
-- Requires creating a function that maps NextAuth email to user_id
-- More complex, less recommended
```

## Recommendation

**Use Option 1** (API Route) because:
1. ✅ Keeps RLS security intact
2. ✅ Server-side authentication check (NextAuth session)
3. ✅ Service role key only used server-side
4. ✅ Simple to implement
5. ✅ Consistent with other API patterns

## Files to Update

1. **Create:** `app/api/integrations/status/route.ts`
2. **Update:** `app/dashboard/settings/SettingsClient.tsx` (lines 46-79)

