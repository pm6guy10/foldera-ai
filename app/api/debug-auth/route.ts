// app/api/debug-auth/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    nextAuthUrl: process.env.NEXTAUTH_URL || 'NOT SET',
    vercelUrl: process.env.VERCEL_URL || 'NOT SET',
    hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    // Show first/last chars of IDs for debugging (not full secrets)
    googleIdPreview: process.env.GOOGLE_CLIENT_ID 
      ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...${process.env.GOOGLE_CLIENT_ID.substring(process.env.GOOGLE_CLIENT_ID.length - 5)}`
      : 'NOT SET',
    environment: process.env.NODE_ENV || 'development',
  });
}

