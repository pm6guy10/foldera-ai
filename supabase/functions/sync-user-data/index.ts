// Supabase Edge Function: Sync User Data
// Runs every 6 hours to fetch latest data from connected sources

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Starting data sync for all connected users...');

    // Get all users with active connectors
    const { data: users, error: usersError } = await supabase
      .from('user_connectors')
      .select('user_id, connector_type, refresh_token, last_sync')
      .eq('status', 'active');

    if (usersError) throw usersError;

    let syncedCount = 0;
    let errorCount = 0;

    // Sync each user's data
    for (const user of users || []) {
      try {
        console.log(`📥 Syncing ${user.connector_type} for user ${user.user_id}`);

        switch (user.connector_type) {
          case 'google_calendar':
            await syncGoogleCalendar(user, supabase);
            break;
          case 'google_drive':
            await syncGoogleDrive(user, supabase);
            break;
          case 'gmail':
            await syncGmail(user, supabase);
            break;
          case 'stripe':
            await syncStripe(user, supabase);
            break;
          case 'github':
            await syncGitHub(user, supabase);
            break;
        }

        // Update last sync timestamp
        await supabase
          .from('user_connectors')
          .update({ last_sync: new Date().toISOString() })
          .eq('user_id', user.user_id)
          .eq('connector_type', user.connector_type);

        syncedCount++;
      } catch (error) {
        console.error(`❌ Sync failed for ${user.connector_type}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Sync complete: ${syncedCount} succeeded, ${errorCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        errors: errorCount,
        timestamp: new Date().toISOString()
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Sync job failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// SYNC FUNCTIONS
async function syncGoogleCalendar(user: any, supabase: any) {
  // Fetch events from last 7 days + next 30 days
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&` +
    `timeMax=${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()}`,
    {
      headers: {
        Authorization: `Bearer ${await refreshAccessToken(user.refresh_token)}`
      }
    }
  );

  const data = await response.json();

  // Store events in database
  for (const event of data.items || []) {
    await supabase.from('user_documents').upsert({
      user_id: user.user_id,
      source: 'google_calendar',
      source_id: event.id,
      title: event.summary,
      content: JSON.stringify(event),
      metadata: {
        start: event.start,
        end: event.end,
        attendees: event.attendees,
        location: event.location
      },
      last_modified: event.updated
    }, { onConflict: 'source_id' });
  }

  console.log(`✅ Synced ${data.items?.length || 0} calendar events`);
}

async function syncGoogleDrive(user: any, supabase: any) {
  // Fetch recently modified files
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?` +
    `q=modifiedTime>'${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}'&` +
    `fields=files(id,name,mimeType,modifiedTime,webViewLink)&` +
    `orderBy=modifiedTime desc&` +
    `pageSize=50`,
    {
      headers: {
        Authorization: `Bearer ${await refreshAccessToken(user.refresh_token)}`
      }
    }
  );

  const data = await response.json();

  // Store files metadata
  for (const file of data.files || []) {
    await supabase.from('user_documents').upsert({
      user_id: user.user_id,
      source: 'google_drive',
      source_id: file.id,
      title: file.name,
      content: file.webViewLink,
      metadata: {
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime
      },
      last_modified: file.modifiedTime
    }, { onConflict: 'source_id' });
  }

  console.log(`✅ Synced ${data.files?.length || 0} Drive files`);
}

async function syncGmail(user: any, supabase: any) {
  // Fetch recent important emails
  const response = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?` +
    `q=is:important OR is:starred after:${Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60}&` +
    `maxResults=50`,
    {
      headers: {
        Authorization: `Bearer ${await refreshAccessToken(user.refresh_token)}`
      }
    }
  );

  const data = await response.json();

  // Fetch full message details
  for (const message of data.messages || []) {
    const msgResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
      {
        headers: {
          Authorization: `Bearer ${await refreshAccessToken(user.refresh_token)}`
        }
      }
    );

    const msgData = await msgResponse.json();

    // Store email in database
    await supabase.from('user_documents').upsert({
      user_id: user.user_id,
      source: 'gmail',
      source_id: message.id,
      title: msgData.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
      content: JSON.stringify(msgData),
      metadata: {
        from: msgData.payload?.headers?.find((h: any) => h.name === 'From')?.value,
        to: msgData.payload?.headers?.find((h: any) => h.name === 'To')?.value,
        date: msgData.payload?.headers?.find((h: any) => h.name === 'Date')?.value,
        snippet: msgData.snippet
      },
      last_modified: new Date(parseInt(msgData.internalDate)).toISOString()
    }, { onConflict: 'source_id' });
  }

  console.log(`✅ Synced ${data.messages?.length || 0} Gmail messages`);
}

async function syncStripe(user: any, supabase: any) {
  // Sync recent charges, subscriptions, and invoices
  console.log('✅ Stripe sync placeholder (implement with Stripe API)');
}

async function syncGitHub(user: any, supabase: any) {
  // Sync recent commits, PRs, and issues
  console.log('✅ GitHub sync placeholder (implement with GitHub API)');
}

// Helper: Refresh Google OAuth token
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json();
  return data.access_token;
}
