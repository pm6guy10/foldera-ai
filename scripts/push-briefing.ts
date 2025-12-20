
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { createClient } from '@supabase/supabase-js';
import { getMicrosoftAccessToken } from '../lib/meeting-prep/auth-microsoft';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface WorkSignal {
  id: string;
  signal_type: 'risk' | 'commitment' | 'stall' | 'context';
  content: string;
  author: string;
  source: string;
  context_tags: string[];
}

async function main() {
  console.log('📧 Starting Briefing Push...');

  try {
    // 1. Find User
    let userId = process.env.TEST_USER_ID;

    if (!userId) {
      console.log('⚠️  TEST_USER_ID not found. Searching for a user with Azure AD integration...');
      const { data: integration } = await supabase
        .from('integrations')
        .select('user_id')
        .eq('provider', 'azure_ad')
        .limit(1)
        .single();
      
      if (integration) {
        userId = integration.user_id;
        console.log(`✅ Found user: ${userId}`);
      } else {
        throw new Error('No user found with Azure AD integration. Please connect a user first.');
      }
    }

    // Get User Email
    const { data: user } = await supabase
      .from('meeting_prep_users')
      .select('email')
      .eq('id', userId)
      .single();
    
    const userEmail = user?.email || 'b.kapp@outlook.com';
    console.log(`📧 Target Email: ${userEmail}`);

    // 2. Auth with Microsoft Graph
    console.log(`[Auth] Getting token...`);
    const accessToken = await getMicrosoftAccessToken(userId!);

    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    // 3. Fetch Recent Signals (Last 24 Hours)
    console.log(`[Fetch] Querying Supabase for recent signals...`);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: signals, error } = await supabase
      .from('work_signals')
      .select('*')
      .eq('user_id', userId)
      .gt('created_at', twentyFourHoursAgo);

    if (error) throw error;

    if (!signals || signals.length === 0) {
      console.log('✅ No new signals found in the last 24 hours. Skipping email.');
      return;
    }

    console.log(`[Fetch] Found ${signals.length} signals.`);

    // 4. Format Email Body
    const risks = signals.filter(s => s.signal_type === 'risk' && !s.context_tags?.includes('Pattern'));
    const commitments = signals.filter(s => s.signal_type === 'commitment');
    const stalls = signals.filter(s => s.signal_type === 'stall' && !s.context_tags?.includes('Pattern'));
    const context = signals.filter(s => (s.signal_type === 'context' || s.signal_type === 'opportunity') && !s.context_tags?.includes('Pattern'));
    
    // New Section: Deep Scan Patterns
    const patterns = signals.filter(s => s.context_tags?.includes('Pattern'));

    const formatList = (items: any[], icon: string, title: string) => {
      if (items.length === 0) return '';
      return `
        <h3 style="margin-top: 20px; font-family: sans-serif;">${icon} ${title}</h3>
        <ul style="font-family: sans-serif; line-height: 1.5;">
          ${items.map(i => `
            <li style="margin-bottom: 8px;">
              <strong>${i.content}</strong>
              <br/>
              <span style="color: #666; font-size: 0.9em;">
                ${i.source === 'outlook' ? '📧 Outlook' : '📨 ' + i.source} • ${i.author}
              </span>
            </li>
          `).join('')}
        </ul>
      `;
    };

    let subject = '';
    if (risks.length > 0) {
      subject = `⚡ Briefing: ${risks.length} Risks Detected`;
    } else {
      subject = `☕ Monday Briefing: All Clear + ${context.length} Active Updates`;
    }
    
    if (patterns.length > 0) {
        subject += ` + ${patterns.length} Ghosts Found`;
    }

    const emailBody = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px;">
        <h2 style="border-bottom: 2px solid #eaeaea; padding-bottom: 10px;">
          ${risks.length > 0 ? '⚡ Monday Morning Briefing' : '☕ Monday Morning Update'}
        </h2>
        <p>
          ${risks.length > 0 
            ? 'Here are the critical signals detected from your communications in the last 24 hours.' 
            : 'Your inbox is clear of critical risks. Here is what is moving forward:'}
        </p>
        
        ${formatList(risks, '🔴', 'Risks')}
        ${formatList(commitments, '🟡', 'Commitments')}
        ${formatList(stalls, '🟠', 'Stalled Threads')}
        ${formatList(patterns, '⚰️', 'Resurfaced Patterns (Ghost Detector)')}
        ${formatList(context, '📡', 'Radar (Active Context)')}
        
        <div style="margin-top: 30px; border-top: 1px solid #eaeaea; padding-top: 10px; font-size: 0.8em; color: #888;">
          Generated by Foldera Proactive Analyst
        </div>
      </div>
    `;

    // 5. Send Email via Graph API
    console.log(`[Send] Sending email to ${userEmail}...`);

    const mail = {
      subject: subject,
      toRecipients: [
        {
          emailAddress: {
            address: userEmail,
          },
        },
      ],
      body: {
        content: emailBody,
        contentType: 'html',
      },
    };

    await client.api('/me/sendMail').post({ message: mail });

    console.log('✅ Briefing sent successfully!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Graph API Error:', JSON.stringify(error.body, null, 2));
    }
  }
}

main();

