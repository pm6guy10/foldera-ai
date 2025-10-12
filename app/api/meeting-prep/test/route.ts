// =====================================================
// FOLDERA MEETING PREP - Test API
// Exposes test utilities for local development
// ONLY ENABLED IN DEVELOPMENT MODE
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import {
  testGoogleAuth,
  testCalendarSync,
  testGmailSync,
  testBriefGeneration,
  testEmailSend,
  listMeetingsNeedingBriefs,
  viewEmailContext,
} from '@/lib/meeting-prep/test-helpers';

/**
 * POST /api/meeting-prep/test
 * Test various meeting prep functions
 * 
 * Body: { action: string, params?: any }
 * 
 * Actions:
 * - test_auth
 * - sync_calendar
 * - sync_gmail
 * - generate_brief (requires meetingId)
 * - send_email (requires briefId)
 * - list_meetings
 * - view_emails (requires meetingId)
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test API disabled in production' },
      { status: 403 }
    );
  }
  
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userEmail = session.user.email;
    const body = await request.json();
    const { action, params } = body;
    
    console.log(`[Test API] Action: ${action}`);
    
    let result;
    
    switch (action) {
      case 'test_auth':
        result = await testGoogleAuth(userEmail);
        break;
        
      case 'sync_calendar':
        result = await testCalendarSync(userEmail);
        break;
        
      case 'sync_gmail':
        const days = params?.days || 30;
        result = await testGmailSync(userEmail, days);
        break;
        
      case 'generate_brief':
        if (!params?.meetingId) {
          return NextResponse.json(
            { error: 'meetingId required' },
            { status: 400 }
          );
        }
        result = await testBriefGeneration(params.meetingId);
        break;
        
      case 'send_email':
        if (!params?.briefId) {
          return NextResponse.json(
            { error: 'briefId required' },
            { status: 400 }
          );
        }
        result = await testEmailSend(params.briefId);
        break;
        
      case 'list_meetings':
        result = await listMeetingsNeedingBriefs(userEmail);
        break;
        
      case 'view_emails':
        if (!params?.meetingId) {
          return NextResponse.json(
            { error: 'meetingId required' },
            { status: 400 }
          );
        }
        result = await viewEmailContext(params.meetingId);
        break;
        
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Test API] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}

