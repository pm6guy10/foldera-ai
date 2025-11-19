import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { authOptions, getMeetingPrepUser } from '@/lib/meeting-prep/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase environment variables are not configured.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const runtime = 'nodejs';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requireUser() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    throw new HttpError(401, 'Unauthorized');
  }

  const meetingUser = await getMeetingPrepUser(session.user.email);
  if (!meetingUser) {
    throw new HttpError(404, 'Linked meeting prep user not found');
  }

  return meetingUser;
}

export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();
    const { data, error } = await supabase
      .from('email_drafts')
      .select('id, draft, sender_email, sender_name, subject, created_at, thread_id, email_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ drafts: data || [] });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[list-drafts] GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load drafts' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const { id, draft } = await request.json();

    if (!id || typeof draft !== 'string' || draft.trim().length === 0) {
      return NextResponse.json({ error: 'Draft id and text required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('email_drafts')
      .update({ draft })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[list-drafts] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update draft' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Draft id required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('email_drafts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[list-drafts] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete draft' },
      { status: 500 }
    );
  }
}


