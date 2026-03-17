import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'This onboarding endpoint has been retired.' },
    { status: 410 },
  );
}
