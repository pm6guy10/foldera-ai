import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { runShadowScan } from '@/lib/shadow-mode/scanner';
import { extractRelationshipMap, fetchAllEmails } from '@/lib/relationship-intelligence';
import { generateBriefing } from '@/lib/briefing/generator';
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
    
    const userId = user.id;
    const userEmail = session.user.email;
    
    logger.info('Briefing generation requested', { userId });
    
    // Run shadow scan
    const scanResult = await runShadowScan(userId, userEmail);
    
    // Get relationship data (optional, may fail)
    let relationshipMap = null;
    try {
      const emails = await fetchAllEmails(userId, userEmail, 90);
      relationshipMap = await extractRelationshipMap(emails, userId, userEmail);
    } catch (error) {
      logger.warn('Relationship extraction failed, continuing without', { userId });
    }
    
    // Generate briefing
    const briefing = await generateBriefing(userId, scanResult, relationshipMap);
    
    return NextResponse.json({
      success: true,
      briefing,
    });
  } catch (error) {
    logger.error('Briefing generation failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    
    return NextResponse.json(
      { error: 'Generation failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

