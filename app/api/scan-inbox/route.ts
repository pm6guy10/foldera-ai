// app/api/scan-inbox/route.ts
import { NextResponse } from 'next/server';
import { getGmailClient, extractPlainBody } from '@/lib/gmail-service'; // Importing from the new file

export async function GET(req: Request) {
  try {
    // 1. Get the client (Assuming userId is 'me' for MVP)
    const gmail = await getGmailClient('me');
    
    // 2. List Threads
    const response = await gmail.users.threads.list({ userId: 'me', maxResults: 5 });
    const threads = response.data.threads || [];

    // 3. Process them
    const results = threads.map(t => ({ id: t.id, snippet: t.snippet }));

    return NextResponse.json({ success: true, threads: results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: 'Scan failed' }, { status: 500 });
  }
}
