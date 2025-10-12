// =====================================================
// FOLDERA MEETING PREP - Sync API Route
// Manually trigger calendar and email sync
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { syncUserData } from '@/lib/meeting-prep/orchestrator';

/**
 * POST /api/meeting-prep/sync
 * Triggers manual sync of calendar + Gmail for authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get user ID from session
    const userId = (session.user as any).id || session.user.email;
    
    console.log(`[API] Manual sync requested by user ${userId}`);
    
    // Trigger sync
    const result = await syncUserData(userId);
    
    return NextResponse.json({
      success: true,
      meetings_synced: result.meetings_synced,
      emails_synced: result.emails_synced,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    console.error('[API] Sync error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to sync data' },
      { status: 500 }
    );
  }
}

