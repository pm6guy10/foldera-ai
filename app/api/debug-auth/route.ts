// app/api/debug-auth/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
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

