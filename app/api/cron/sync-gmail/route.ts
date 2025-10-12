// =====================================================
// FOLDERA MEETING PREP - Cron Job: Sync Gmail
// Syncs Gmail emails for all users
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncGmailCache } from '@/lib/meeting-prep/gmail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET/POST /api/cron/sync-gmail
 * Syncs Gmail for all users with Google connections
 * Vercel cron schedule: Every 30 minutes
 */
export async function GET(request: NextRequest) {
  return handleCronJob(request);
}

export async function POST(request: NextRequest) {
  return handleCronJob(request);
}

async function handleCronJob(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized cron request');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('[Cron] Starting Gmail sync job...');
    
    // Get all users with Google connections
    const { data: users, error } = await supabase
      .from('meeting_prep_users')
      .select('id, email')
      .not('google_access_token', 'is', null);
    
    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
    
    const results = {
      users_synced: 0,
      total_emails: 0,
      errors: [] as string[],
    };
    
    // Sync each user
    for (const user of users || []) {
      try {
        const emailsSynced = await syncGmailCache(user.id);
        results.users_synced++;
        results.total_emails += emailsSynced;
      } catch (error: any) {
        console.error(`[Cron] Gmail sync failed for user ${user.email}:`, error);
        results.errors.push(`${user.email}: ${error.message}`);
      }
    }
    
    console.log('[Cron] Gmail sync complete:', results);
    
    return NextResponse.json({
      success: results.errors.length === 0,
      ...results,
    });
  } catch (error: any) {
    console.error('[Cron] Job failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Cron job failed',
      },
      { status: 500 }
    );
  }
}

