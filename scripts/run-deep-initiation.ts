
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getMicrosoftAccessToken } from '../lib/meeting-prep/auth-microsoft';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EmailMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  sentDateTime: string;
  folder?: string;
}

async function main() {
  console.log('🧘 Deep Initiation (Psychological & Legal Profile) Starting...');

  try {
    // 1. Auth & Setup
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
        throw new Error('No user found with Azure AD integration.');
      }
    }

    console.log(`[Auth] Getting token for user: ${userId}`);
    const accessToken = await getMicrosoftAccessToken(userId);

    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    // Get User Email
    const { data: user } = await supabase
    .from('meeting_prep_users')
    .select('email')
    .eq('id', userId)
    .single();
  
    const userEmail = user?.email || 'b.kapp@outlook.com';

    // 2. Deep Harvest (18 Months / 500 Significant Emails)
    console.log(`[Deep Harvest] Scanning last 18 months...`);

    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    const filterIso = eighteenMonthsAgo.toISOString();

    let allMessages: EmailMessage[] = [];
    
    // Fetch Sent Items
    let nextLink = '/me/mailFolders/sentitems/messages' + 
      `?$filter=sentDateTime ge ${filterIso}` +
      `&$top=50` + 
      `&$select=id,subject,bodyPreview,sentDateTime` + 
      `&$orderby=sentDateTime desc`;

    let pageCount = 0;
    const MAX_PAGES = 20; // 1000 raw emails to find 500 significant ones

    process.stdout.write('[Fetch] Scanning Sent Items: ');
    while (nextLink && pageCount < MAX_PAGES && allMessages.length < 500) {
      process.stdout.write('.');
      
      try {
        const response = await client.api(nextLink).get();
        const messages: EmailMessage[] = response.value || [];
        
        // Filter: > 50 words (substantive)
        const significantMessages = messages.filter(m => {
          const body = m.bodyPreview || '';
          const wordCount = body.split(/\s+/).length;
          
          if (wordCount < 50) return false;
          if (body.toLowerCase().includes('unsubscribe')) return false;
          return true;
        });

        allMessages = allMessages.concat(significantMessages.map(m => ({...m, folder: 'Sent Items'})));
        nextLink = response['@odata.nextLink'];
        pageCount++;
      } catch (err: any) {
        console.error('Error fetching page:', err.message);
        break;
      }
    }
    console.log('\n');

    // Fetch "Legal" search results (if any)
    console.log('[Fetch] Searching for "legal" or "contract" contexts...');
    try {
        const legalResponse = await client.api('/me/messages')
            .search('"legal" OR "contract" OR "dispute"')
            .top(50)
            .select('id,subject,bodyPreview,sentDateTime')
            .get();
            
        const legalMessages: EmailMessage[] = legalResponse.value || [];
        const validLegal = legalMessages.filter(m => {
            const body = m.bodyPreview || '';
            return body.split(/\s+/).length > 30; // Slightly lower threshold for legal context
        });
        
        console.log(`[Fetch] Found ${validLegal.length} specific legal context emails.`);
        allMessages = allMessages.concat(validLegal.map(m => ({...m, folder: 'Legal Context'})));

    } catch (err: any) {
        console.warn('⚠️  Legal search failed or not supported:', err.message);
    }

    // Deduplicate
    const uniqueMessages = Array.from(new Map(allMessages.map(m => [m.id, m])).values());
    console.log(`[Harvest] Collected ${uniqueMessages.length} significant substantive emails.`);

    if (uniqueMessages.length < 10) {
        console.log('❌ Not enough data for a deep profile. Need at least 10 significant emails.');
        return;
    }

    // 3. Prepare Payload (Cap at ~100k chars)
    // Prioritize Legal context first, then recent Sent items
    const sortedMessages = uniqueMessages.sort((a, b) => {
        if (a.folder === 'Legal Context' && b.folder !== 'Legal Context') return -1;
        if (b.folder === 'Legal Context' && a.folder !== 'Legal Context') return 1;
        return new Date(b.sentDateTime).getTime() - new Date(a.sentDateTime).getTime();
    });

    const fullText = sortedMessages.map(m => {
      return `[${m.folder}] Subject: ${m.subject}\nBody: ${m.bodyPreview}\n---\n`;
    }).join('\n');

    const textPayload = fullText.slice(0, 120000); // Increased limit slightly for deep scan

    console.log(`[Analyze] Sending ${textPayload.length} chars to "The Career Strategist" (GPT-4o)...`);

    // 4. The Mirror Analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a high-level Career Strategist and Psychologist analyzing this user's email history (last 18 months).
Do NOT look for tasks. Look for PATTERNS in their psychology, performance, and conflict resolution.

Output a JSON report with the following structure:

1. **Zone of Genius** (Encouragement):
   - Identify 3 specific interactions/themes where the user was 'on fire' (persuasive, clear, high-leverage).
   - Define the specific skill used (e.g. "Mastery of de-escalation").
   - Actionable advice: "Do more X, less Y".

2. **The Legal Pattern** (Sanity Check):
   - Review the legal/conflict threads.
   - What is the recurring nightmare or pattern? (e.g. "You keep getting stuck on IP clauses").
   - Validate them: "You aren't crazy. The pattern is..."

3. **The Opportunity** (Proactive):
   - Based on their 'Zone of Genius', suggest 2 roles or project types they are uniquely suited for.
   - Contrast: "You write like a Head of Strategy, not a PM."

Schema:
{
  "zone_of_genius": {
    "themes": [
      { "title": "Theme Title", "description": "Description", "evidence": "Reference to email content" }
    ],
    "core_skill": "Name of the skill",
    "advice": "Actionable advice"
  },
  "legal_pattern": {
    "recurrence": "Description of recurring issue",
    "validation": "Validation message",
    "pattern_name": "Name of the pattern"
  },
  "opportunity": {
    "roles": ["Role 1", "Role 2"],
    "observation": "Contrast observation (You act like X, not Y)"
  }
}`
        },
        {
          role: 'user',
          content: `Analyze this Email History:\n\n${textPayload}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;
    const parsed = JSON.parse(result || '{}');

    // 5. Save Analysis to Database
    console.log('[Persist] Saving Deep Pattern Analysis to Supabase...');
    const signalId = `outlook:deep-profile:${new Date().toISOString().split('T')[0]}`;
    
    await supabase.from('work_signals').upsert({
        user_id: userId,
        signal_id: signalId,
        source: 'outlook',
        author: 'The Mirror',
        content: `Deep Pattern Analysis: ${parsed.opportunity?.observation || 'Profile Generated'}`,
        signal_type: 'context', // Fallback to 'context' if 'pattern' not allowed, using tags
        context_tags: ['Pattern', 'Deep Profile', 'Legal'],
        raw_metadata: parsed
    } as any, { onConflict: 'user_id,signal_id' });

    // 6. Generate & Send Email
    console.log(`[Send] Sending "The Mirror" report to ${userEmail}...`);

    const formatThemes = (themes: any[]) => {
        return themes.map(t => `
            <li style="margin-bottom: 15px;">
                <strong>${t.title}</strong><br/>
                <span style="color: #444;">${t.description}</span><br/>
                <em style="color: #666; font-size: 0.9em;">Evidence: ${t.evidence}</em>
            </li>
        `).join('');
    };

    const emailBody = `
      <div style="font-family: sans-serif; color: #333; max-width: 700px; line-height: 1.6;">
        <h2 style="border-bottom: 2px solid #eaeaea; padding-bottom: 10px; color: #1e3a8a;">🪞 Your Deep Pattern Analysis (18 Months)</h2>
        
        <p>I've analyzed your substantial communications from the last 18 months. Here is who you are when you are at your best, and where you are getting stuck.</p>

        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #0369a1; margin-top: 0;">🌟 The Zone of Genius</h3>
            <p><strong>Core Skill:</strong> ${parsed.zone_of_genius?.core_skill}</p>
            <ul>${formatThemes(parsed.zone_of_genius?.themes || [])}</ul>
            <p style="font-weight: bold; color: #0369a1;">👉 ${parsed.zone_of_genius?.advice}</p>
        </div>

        <div style="background-color: #fff1f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #be123c; margin-top: 0;">⚖️ The Legal Pattern</h3>
            <p><strong>The Nightmare:</strong> ${parsed.legal_pattern?.pattern_name}</p>
            <p>${parsed.legal_pattern?.recurrence}</p>
            <p style="font-style: italic;">"${parsed.legal_pattern?.validation}"</p>
        </div>

        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #15803d; margin-top: 0;">🚀 The Opportunity</h3>
            <p style="font-size: 1.1em; font-weight: bold;">${parsed.opportunity?.observation}</p>
            <p>Based on your unique signature, you should consider roles like:</p>
            <ul>
                ${parsed.opportunity?.roles?.map((r: string) => `<li>${r}</li>`).join('')}
            </ul>
        </div>

        <div style="margin-top: 30px; border-top: 1px solid #eaeaea; padding-top: 10px; font-size: 0.8em; color: #888;">
          Generated by Foldera Proactive Analyst • Identity Mirror
        </div>
      </div>
    `;

    const mail = {
      subject: `🪞 Your Deep Pattern Analysis (18 Months)`,
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

    console.log('✅ Deep Pattern Analysis Complete & Sent!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Graph API Error:', JSON.stringify(error.body, null, 2));
    }
  }
}

main();

