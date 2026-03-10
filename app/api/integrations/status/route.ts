/**
 * GET /api/integrations/status
 *
 * Returns the list of connected OAuth integrations for the authenticated user.
 * Stub: returns empty array until real integration tables are wired.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: query tkg_integrations when the table is created
  // For now, return an empty array so SettingsClient renders cleanly
  return NextResponse.json({ integrations: [] });
}
