// app/api/generate-draft/route.ts
import { NextResponse } from 'next/server';
import { generateDraftForThread } from '@/lib/gmail-service'; // Importing from the new file

export async function POST(req: Request) {
  try {
    const { threadId, userId } = await req.json();
    const draft = await generateDraftForThread(threadId, userId);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to generate' }, { status: 500 });
  }
}
