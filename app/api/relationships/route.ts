import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { extractRelationshipMap, fetchAllEmails } from '@/lib/relationship-intelligence';
import { logger, setTraceId } from '@/lib/observability/logger';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
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
    
    const userId = user.id;
    const userEmail = session.user.email;
    
    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const lookbackDays = parseInt(searchParams.get('days') || '90');
    
    logger.info('Relationship map requested', { userId, lookbackDays });
    
    const emails = await fetchAllEmails(userId, userEmail, lookbackDays);
    const relationshipMap = await extractRelationshipMap(emails, userId, userEmail);
    
    return NextResponse.json({
      success: true,
      data: relationshipMap,
    });
  } catch (error) {
    logger.error('Relationship extraction failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    
    return NextResponse.json(
      { error: 'Extraction failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}


