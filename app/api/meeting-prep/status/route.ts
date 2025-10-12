// =====================================================
// FOLDERA MEETING PREP - Status API
// Get user's meeting prep status and sync info
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { getProcessingStatus } from '@/lib/meeting-prep/orchestrator';
import { hasValidGoogleConnection } from '@/lib/meeting-prep/auth';

/**
 * GET /api/meeting-prep/status
 * Gets current status of meeting prep system for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = (session.user as any).id || session.user.email;
    
    // Check Google connection
    const googleConnected = await hasValidGoogleConnection(userId);
    
    if (!googleConnected) {
      return NextResponse.json({
        success: true,
        google_connected: false,
        message: 'Google account not connected',
      });
    }
    
    // Get processing status
    const status = await getProcessingStatus(userId);
    
    return NextResponse.json({
      success: true,
      google_connected: true,
      ...status,
    });
  } catch (error: any) {
    console.error('[API] Status error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

