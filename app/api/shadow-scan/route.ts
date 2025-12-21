import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { runShadowScan } from '@/lib/shadow-mode/scanner';
import { logger, setTraceId } from '@/lib/observability/logger';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  setTraceId();
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user ID from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: user, error: userError } = await supabase
      .from('meeting_prep_users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const body = await request.json().catch(() => ({}));
    
    logger.info('Shadow scan requested', { 
      userId: user.id,
      config: body.config,
    });
    
    const result = await runShadowScan(
      user.id,
      session.user.email,
      body.config
    );
    
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error('Shadow scan failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    
    return NextResponse.json(
      { error: 'Scan failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

