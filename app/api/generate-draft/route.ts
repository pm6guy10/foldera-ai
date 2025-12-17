// app/api/generate-draft/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { generateDraftForThread } from '@/lib/gmail-service'; // Importing from the new file

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId, userId } = await req.json();
    const draft = await generateDraftForThread(threadId, userId);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to generate' }, { status: 500 });
  }
}
