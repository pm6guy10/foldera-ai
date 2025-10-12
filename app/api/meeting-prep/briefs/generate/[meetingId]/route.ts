// =====================================================
// FOLDERA MEETING PREP - Generate Brief API
// Manually trigger brief generation for a meeting
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { getMeetingById } from '@/lib/meeting-prep/google-calendar';
import { generateBrief, regenerateBrief } from '@/lib/meeting-prep/brief-generator';

/**
 * POST /api/meeting-prep/briefs/generate/[meetingId]
 * Generates a brief for a specific meeting
 * Query param: ?force=true to regenerate existing brief
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { meetingId: string } }
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
    const meetingId = params.meetingId;
    
    // Check if force regenerate
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    console.log(`[API] Brief generation requested for meeting ${meetingId} (force: ${force})`);
    
    // Verify meeting exists and user owns it
    const meeting = await getMeetingById(meetingId);
    
    if (!meeting) {
      return NextResponse.json(
        { error: 'Meeting not found' },
        { status: 404 }
      );
    }
    
    if (meeting.user_id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    // Generate brief
    let brief;
    if (force) {
      brief = await regenerateBrief(meetingId);
    } else {
      brief = await generateBrief(meetingId);
    }
    
    return NextResponse.json({
      success: true,
      brief_id: brief.id,
      brief,
    });
  } catch (error: any) {
    console.error('[API] Brief generation error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to generate brief' },
      { status: 500 }
    );
  }
}

