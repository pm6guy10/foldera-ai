// =====================================================
// INTEGRATIONS STATUS API
// Returns user's integration status (bypasses RLS via service role)
// =====================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/integrations/status
 * Gets integration status for authenticated user
 * Uses service role to bypass RLS (since NextAuth users don't have Supabase Auth sessions)
 */
export async function GET(request: NextRequest) {
  try {
    // Check NextAuth session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Use service role to bypass RLS
    // This is safe because we've already authenticated via NextAuth above
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user ID from email
    const { data: user, error: userError } = await supabase
      .from('meeting_prep_users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userError || !user) {
      // User doesn't exist yet (new sign-up, hasn't been created in DB)
      return NextResponse.json({ integrations: [] });
    }

    // Get integrations (service role bypasses RLS)
    const { data: integrations, error: integrationsError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .order('provider', { ascending: true });

    if (integrationsError) {
      console.error('[API] Error fetching integrations:', integrationsError);
      return NextResponse.json(
        { error: integrationsError.message || 'Failed to fetch integrations' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      integrations: integrations || [],
      user_id: user.id 
    });
  } catch (error: any) {
    console.error('[API] Integration status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch integration status' },
      { status: 500 }
    );
  }
}

