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
  const requestId = crypto.randomUUID();
  
  try {
    // Check NextAuth session
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized', requestId },
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
      return NextResponse.json({ 
        integrations: [],
        requestId,
      });
    }

    // Get integrations (service role bypasses RLS)
    const { data: integrations, error: integrationsError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .order('provider', { ascending: true });

    if (integrationsError) {
      const { logger } = await import('@/lib/observability/logger');
      logger.error('Failed to fetch integrations', {
        requestId,
        userId: user.id,
        email: session.user.email,
        error: integrationsError
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch integrations',
          requestId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      integrations: integrations || [],
      user_id: user.id,
      requestId,
    });
  } catch (error: any) {
    const { logger } = await import('@/lib/observability/logger');
    const session = await getServerSession(authOptions).catch(() => null);
    
    logger.error('Integration status error', {
      requestId,
      email: session?.user?.email || 'unknown',
      error
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        requestId,
      },
      { status: 500 }
    );
  }
}

