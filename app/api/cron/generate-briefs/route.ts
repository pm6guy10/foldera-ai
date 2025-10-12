// =====================================================
// FOLDERA MEETING PREP - Cron Job: Generate Briefs
// Automatically generates and sends briefs before meetings
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { processMeetingBriefs } from '@/lib/meeting-prep/orchestrator';

/**
 * GET/POST /api/cron/generate-briefs
 * Cron job that processes all users and generates/sends briefs
 * Protected by CRON_SECRET
 * 
 * Vercel cron schedule: Every 5 minutes
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
    
    console.log('[Cron] Starting brief generation job...');
    
    // Process all users
    const result = await processMeetingBriefs();
    
    console.log('[Cron] Job complete:', result);
    
    return NextResponse.json({
      success: result.success,
      summary: {
        users_processed: result.users_processed,
        meetings_synced: result.meetings_synced,
        emails_synced: result.emails_synced,
        briefs_generated: result.briefs_generated,
        briefs_sent: result.briefs_sent,
        duration_ms: result.duration_ms,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
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

