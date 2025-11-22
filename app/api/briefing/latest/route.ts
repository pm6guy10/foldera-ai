// =====================================================
// THE NARRATOR - Briefing API
// Phase 4: Monday Morning Briefing Endpoint
// =====================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { getMeetingPrepUser } from '@/lib/meeting-prep/auth';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { generateBriefing } from '@/lib/intelligence/briefing-generator';

// Lazy initialization to avoid build-time errors
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(url, key);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }
  
  return new OpenAI({ apiKey });
}

/**
 * GET /api/briefing/latest
 * Gets the latest Monday Morning Briefing for authenticated user
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

    // Get meeting prep user
    const meetingUser = await getMeetingPrepUser(session.user.email);
    
    if (!meetingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Initialize clients
    const supabase = getSupabaseClient();
    const openai = getOpenAIClient();

    // Generate briefing
    console.log(`[Narrator API] Generating briefing for user ${meetingUser.id}`);
    
    const briefing = await generateBriefing(
      meetingUser.id,
      supabase,
      openai
    );

    return NextResponse.json({
      success: true,
      briefing,
      generated_at: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Narrator API] Error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate briefing',
        briefing: `# Monday Morning Briefing\n\n## Error\n\nUnable to generate briefing: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

