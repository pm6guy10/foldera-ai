
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

// Initialize Supabase (for finding a user)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Types
interface EmailMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  sentDateTime: string;
  conversationId: string;
  isRead: boolean;
}

interface Thread {
  conversationId: string;
  subject: string;
  messages: EmailMessage[];
  lastActivity: Date;
}

async function main() {
  console.log('🕵️  Outlook Analyst (Shadow Mode) Starting...');

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
        throw new Error('No user found with Azure AD integration. Please connect a user first.');
      }
    }

    console.log(`[Auth] Getting token for user: ${userId}`);
    const accessToken = await getMicrosoftAccessToken(userId);

    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    // 2. Calculate Date Filter (Last 3 Days)
    const daysBack = 3;
    const filterDate = new Date();
    filterDate.setDate(filterDate.getDate() - daysBack);
    // filterDate.setHours(0, 0, 0, 0); // Optional: Start of day
    const filterIso = filterDate.toISOString();

    console.log(`[Fetch] Getting global messages since ${filterIso}...`);

    // 3. Fetch Messages (Global Scope)
    // Using /me/messages to search across all folders (Inbox, Sent, Archive, etc.)
    const response = await client.api('/me/messages')
      .filter(`lastModifiedDateTime ge ${filterIso}`)
      .top(50)
      .select('id,subject,bodyPreview,from,toRecipients,sentDateTime,conversationId,isRead')
      .orderby('lastModifiedDateTime desc')
      .get();

    const messages: EmailMessage[] = response.value || [];
    console.log(`[Fetch] Found ${messages.length} recent messages.`);

    if (messages.length === 0) {
      console.log('No messages found. Exiting.');
      return;
    }

    // 4. Group by Thread (conversationId)
    const threadsMap = new Map<string, Thread>();

    for (const msg of messages) {
      if (!msg.conversationId) continue;

      if (!threadsMap.has(msg.conversationId)) {
        threadsMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          subject: msg.subject,
          messages: [],
          lastActivity: new Date(0),
        });
      }

      const thread = threadsMap.get(msg.conversationId)!;
      thread.messages.push(msg);
      
      const msgDate = new Date(msg.sentDateTime);
      if (msgDate > thread.lastActivity) {
        thread.lastActivity = msgDate;
      }
    }

    const threads = Array.from(threadsMap.values());
    console.log(`[Group] Reconstructed ${threads.length} active threads.`);

    // 5. Prepare Payload for AI
    // We limit to top 10 most active/recent threads to save tokens for this test
    const activeThreads = threads
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, 10);

    const analysisPayload = activeThreads.map(t => {
      return `
THREAD: ${t.subject} (ID: ${t.conversationId})
Last Activity: ${t.lastActivity.toISOString()}
Messages:
${t.messages.map(m => `  - [${m.sentDateTime}] ${m.from?.emailAddress?.name || 'Unknown'}: ${m.bodyPreview}`).join('\n')}
--------------------------------------------------
`;
    }).join('\n');

    console.log(`[Analyze] Sending ${activeThreads.length} threads to "The Brain" (GPT-4o)...`);

    // 6. Analyze with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an Executive Chief of Staff. Analyze these email threads for buried signals. DO NOT summarize. Look for:

1. Commitments: Did the user promise something ('I'll send it Friday') that hasn't happened?
2. Stalls: Is the user waiting on a reply for >3 days?
3. Risks: Is a VIP client using tense language?

New Rule: If 0 risks found, you MUST identify the top 3 ACTIVE CONTEXT threads (projects moving forward, meetings planned, exciting news). Never return an empty list. Always find the most relevant 'Context' or 'Opportunity'.

Output: JSON array of WorkSignal objects.
Schema:
{
  "signals": [
    {
      "source": "outlook",
      "signal_type": "risk" | "commitment" | "stall" | "context" | "opportunity",
      "content": "Short description of the signal",
      "author": "Name of the person related to the signal (e.g. sender or recipient)",
      "context_score": number (1-10, 10 is critical/important),
      "thread_id": "The ID of the thread"
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Analyze these threads:\n\n${analysisPayload}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2, // Low temp for factual analysis
    });

    const result = completion.choices[0].message.content;
    const parsed = JSON.parse(result || '{}');
    
    // 7. Output Results
    console.log('\n🧠 ANALYST FINDINGS:\n');
    
    if (parsed.signals && parsed.signals.length > 0) {
      // 8. Cleanup Old Signals
      console.log('[Cleanup] Removing old Outlook signals (older than 24h)...');
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { error: deleteError } = await supabase
        .from('work_signals')
        .delete()
        .eq('source', 'outlook')
        .eq('user_id', userId)
        .lt('created_at', twentyFourHoursAgo);

      if (deleteError) {
        console.error('❌ Error cleaning up old signals:', deleteError.message);
      }

      // 9. Save Loop
      console.log(`[Persist] Saving ${parsed.signals.length} signals to database...`);

      for (const signal of parsed.signals) {
        try {
          const signalId = `outlook:${signal.thread_id || 'unknown'}`;
          
          // Map to WorkSignal schema
          const signalPayload = {
            user_id: userId,
            signal_id: signalId,
            source: 'outlook',
            author: signal.author || 'Unknown',
            content: signal.content,
            context_tags: [signal.signal_type, `Score: ${signal.context_score}`],
            raw_metadata: {
              signal_type: signal.signal_type,
              context_score: signal.context_score,
              thread_id: signal.thread_id
            }
          };

          const { error } = await supabase
            .from('work_signals')
            .upsert(signalPayload, {
              onConflict: 'user_id,signal_id'
            });

          if (error) {
            // Fallback for DB Constraint: If 'outlook' is not allowed, try 'gmail' (closest equivalent)
            if (error.message.includes('work_signals_source_check')) {
              console.warn(`⚠️  DB Constraint: 'outlook' source not yet allowed. Falling back to 'gmail' temporarily.`);
              const fallbackPayload = { ...signalPayload, source: 'gmail' };
              const { error: fallbackError } = await supabase
                .from('work_signals')
                .upsert(fallbackPayload, { onConflict: 'user_id,signal_id' });
              
              if (fallbackError) {
                console.error(`❌ Failed to save signal (fallback):`, fallbackError.message);
              } else {
                console.log(`Saved [${signal.signal_type}] signal: "${signal.content}" (as gmail)`);
              }
            } else {
               console.error(`❌ Failed to save signal "${signal.content}":`, error.message);
            }
          } else {
            console.log(`Saved [${signal.signal_type}] signal: "${signal.content}"`);
          }
        } catch (err: any) {
          console.error(`❌ Error saving signal:`, err.message);
        }
      }

    } else {
      console.log('✅ All clear. No risks, stalls, or open commitments detected in recent threads.');
    }

    console.log('\nAnalysis Complete.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Graph API Error:', JSON.stringify(error.body, null, 2));
    }
  }
}

main();

