// =====================================================
// FOLDERA MEETING PREP - Get Brief by ID
// Retrieve a specific brief
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { getBriefById } from '@/lib/meeting-prep/brief-generator';

/**
 * GET /api/meeting-prep/briefs/[id]
 * Gets a brief by ID (user must own it)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    const briefId = params.id;
    
    // Fetch brief
    const brief = await getBriefById(briefId);
    
    if (!brief) {
      return NextResponse.json(
        { error: 'Brief not found' },
        { status: 404 }
      );
    }
    
    // Verify ownership
    if (brief.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error: any) {
    console.error('[API] Error fetching brief:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch brief' },
      { status: 500 }
    );
  }
}

