// =====================================================
// FOLDERA MEETING PREP - Meetings API
// Get upcoming meetings for user
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { createClient } from '@supabase/supabase-js';
import type { Meeting } from '@/types/meeting-prep';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/meeting-prep/meetings
 * Gets upcoming meetings for authenticated user
 * Query params: ?days=7 (default 7 days ahead)
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
    
    const userId = session.user.id;
    
    // Get query params
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    
    // Calculate date range
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    // Fetch meetings
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        briefs:briefs(id, generated_at, sent_at)
      `)
      .eq('user_id', userId)
      .eq('is_cancelled', false)
      .gte('start_time', now.toISOString())
      .lte('start_time', futureDate.toISOString())
      .order('start_time', { ascending: true });
    
    if (error) {
      throw new Error(`Failed to fetch meetings: ${error.message}`);
    }
    
    return NextResponse.json({
      success: true,
      meetings: data || [],
      count: data?.length || 0,
    });
  } catch (error: any) {
    console.error('[API] Error fetching meetings:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}

