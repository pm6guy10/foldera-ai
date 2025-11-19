import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getMeetingPrepUser } from '@/lib/meeting-prep/auth';
import {
  generateDraftForThread,
} from './utils';
import {
  generateDraftResponse,
  upsertDraft,
  formatHistoryForPrompt,
} from './draft-helpers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { emailId, threadId } = body || {};

    const targetId: string | undefined = threadId || emailId;
    if (!targetId) {
      return NextResponse.json({ error: 'emailId (thread ID) is required' }, { status: 400 });
    }

    const meetingUser = await getMeetingPrepUser(session.user.email);
    if (!meetingUser) {
      return NextResponse.json({ error: 'Linked meeting prep user not found' }, { status: 404 });
    }

    const result = await generateDraftForThread({
      userId: meetingUser.id,
      userEmail: session.user.email,
      userName: session.user.name || session.user.email,
      targetId,
      generateDraft: generateDraftResponse,
      upsertDraft,
      formatHistory: formatHistoryForPrompt,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[generate-draft] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate draft' },
      { status: error.status || 500 }
    );
  }
}




