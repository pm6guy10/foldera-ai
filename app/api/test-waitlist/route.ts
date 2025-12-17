import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  // Safety: never expose waitlist data in production.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ 
        error: 'Missing Supabase credentials',
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Try to query the waitlist table
    const { data, error, count } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact' });

    if (error) {
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      });
    }

    return NextResponse.json({ 
      success: true, 
      count,
      message: 'Supabase connection working!',
      data: data?.slice(0, 3) // Only show first 3 entries
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
}


