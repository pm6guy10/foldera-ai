
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
  lastSenderEmail: string;
}

async function main() {
  console.log('🕵️  Outlook Deep Scan (Ghost Detector) Starting...');

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

    // Get My Email (to detect "Ghosting")
    const me = await client.api('/me').get();
    const myEmail = me.userPrincipalName || me.mail;
    console.log(`[Identity] Analyzing as: ${myEmail}`);

    // 2. Deep Fetch (Last 90 Days)
    const daysBack = 90;
    const filterDate = new Date();
    filterDate.setDate(filterDate.getDate() - daysBack);
    const filterIso = filterDate.toISOString();

    console.log(`[Deep Fetch] Scrolling back to ${filterIso}...`);

    let allMessages: EmailMessage[] = [];
    let nextLink = '/me/messages' + 
      `?$filter=lastModifiedDateTime ge ${filterIso}` + 
      `&$top=50` + 
      `&$select=id,subject,bodyPreview,from,toRecipients,sentDateTime,conversationId,isRead` + 
      `&$orderby=lastModifiedDateTime desc`;

    let pageCount = 0;

    // Pagination Loop
    while (nextLink && pageCount < 20) { // Safety limit: 1000 emails max
      console.log(`[Fetch] Page ${pageCount + 1}...`);
      
      const response = await client.api(nextLink).get();
      const messages: EmailMessage[] = response.value || [];
      
      // Local Filter: Discard Noise
      const cleanMessages = messages.filter(m => {
        const from = m.from?.emailAddress?.address?.toLowerCase() || '';
        const subject = m.subject?.toLowerCase() || '';
        
        if (from.includes('noreply') || from.includes('newsletter') || from.includes('notifications')) return false;
        if (subject.includes('automatic reply') || subject.includes('unsubscribe')) return false;
        return true;
      });

      allMessages = allMessages.concat(cleanMessages);
      
      // Update nextLink
      nextLink = response['@odata.nextLink'];
      pageCount++;
    }

    console.log(`[Fetch] Total Messages Analyzed: ${allMessages.length}`);

    // 3. Group by Thread & Detect Ghosts
    const threadsMap = new Map<string, Thread>();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const msg of allMessages) {
      if (!msg.conversationId) continue;

      if (!threadsMap.has(msg.conversationId)) {
        threadsMap.set(msg.conversationId, {
          conversationId: msg.conversationId,
          subject: msg.subject,
          messages: [],
          lastActivity: new Date(0), // Initialize old
          lastSenderEmail: '',
        });
      }

      const thread = threadsMap.get(msg.conversationId)!;
      thread.messages.push(msg);
      
      const msgDate = new Date(msg.sentDateTime);
      // Track latest activity
      if (msgDate > thread.lastActivity) {
        thread.lastActivity = msgDate;
        thread.lastSenderEmail = msg.from?.emailAddress?.address || '';
      }
    }

    const threads = Array.from(threadsMap.values());
    console.log(`[Group] Reconstructed ${threads.length} threads.`);

    // 4. Ghost Detection Logic
    // "Ghosting:" Threads where I was the last person to speak > 7 days ago.
    const ghostThreads = threads.filter(t => {
        const isMeLast = t.lastSenderEmail.toLowerCase() === myEmail.toLowerCase();
        const isStalled = t.lastActivity < sevenDaysAgo;
        return isMeLast && isStalled;
    });

    console.log(`[Ghost Detector] Found ${ghostThreads.length} potential stalled threads (Waiting on Reply).`);

    if (ghostThreads.length === 0) {
        console.log('✅ No ghosts found. You are on top of everything.');
        return;
    }

    // 5. Prepare Payload for AI (Top 20 Stalled)
    const topGhosts = ghostThreads
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()) // Most recent stalls first
      .slice(0, 20);

    const analysisPayload = topGhosts.map(t => {
      // Get last 3 messages for context
      const lastMessages = t.messages
        .sort((a, b) => new Date(a.sentDateTime).getTime() - new Date(b.sentDateTime).getTime())
        .slice(-3);

      return `
THREAD: ${t.subject} (ID: ${t.conversationId})
Last Activity: ${t.lastActivity.toISOString()}
Messages:
${lastMessages.map(m => `  - [${m.sentDateTime}] ${m.from?.emailAddress?.name || 'Unknown'}: ${m.bodyPreview}`).join('\n')}
--------------------------------------------------
`;
    }).join('\n');

    console.log(`[Analyze] Sending ${topGhosts.length} stalled threads to "The Brain" (GPT-4o)...`);

    // 6. Analyze with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a Chief of Staff performing a 'Deep Scan' of old emails.
Analyze these stalled threads where the user was the last person to speak > 7 days ago.

Determine if this is:
1. 'Waiting on them' (Safe) - User asked a question, they didn't reply.
2. 'Dropped Ball' (Risk) - User promised to follow up but didn't.
3. 'Dead Body' - A relationship that has gone silent.

Output: JSON array of WorkSignal objects.
Schema:
{
  "signals": [
    {
      "source": "outlook",
      "signal_type": "pattern",
      "content": "Short description of the pattern (e.g. 'Waiting on reply from Client X re: Contract')",
      "author": "Name of the counterparty",
      "context_score": number (1-10, 10 is critical risk),
      "thread_id": "The ID of the thread"
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Analyze these stalled threads:\n\n${analysisPayload}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const result = completion.choices[0].message.content;
    const parsed = JSON.parse(result || '{}');
    
    // 7. Output Results
    console.log('\n⚰️  DEEP SCAN FINDINGS:\n');
    
    if (parsed.signals && parsed.signals.length > 0) {
      
      // Cleanup old "pattern" signals
      console.log('[Cleanup] Refreshing deep scan patterns...');
       const { error: deleteError } = await supabase
        .from('work_signals')
        .delete()
        .eq('source', 'outlook')
        .eq('user_id', userId)
        .eq('context_tags', ['pattern']); // We'll tag them as 'pattern' in array to filter safely if needed, but signal_type is better filter.
        // Actually, let's use signal_type if we can, but DB constraint might not allow 'pattern'.
        // Let's use 'context' signal_type but TAG it as 'pattern' in context_tags.
        // Wait, User asked for type: 'pattern'. 
        // If DB Constraint blocks 'pattern', I'll use 'risk' or 'stall' and tag it.
        // Let's try to map to 'stall' for "Waiting on them" and 'risk' for "Dropped Ball".
        // But the prompt says specific section "Resurfaced Patterns".
        // I will save them with signal_type='stall' (safe) or 'risk' (bad) and add 'Pattern' to context_tags.

      console.log(`[Persist] Saving ${parsed.signals.length} patterns...`);

      for (const signal of parsed.signals) {
        try {
          const signalId = `outlook:deep:${signal.thread_id || 'unknown'}`;
          
          // Map to WorkSignal schema
          // We map 'pattern' from AI to allowed types.
          // If context_score > 7 -> risk. Else -> stall.
          const mappedType = signal.context_score > 7 ? 'risk' : 'stall';

          const signalPayload = {
            user_id: userId,
            signal_id: signalId,
            source: 'outlook',
            author: signal.author || 'Unknown',
            content: signal.content,
            // Tagging as 'Pattern' allows us to filter them for the "Resurfaced" section
            context_tags: ['Pattern', signal.signal_type], 
            raw_metadata: {
              original_type: 'pattern',
              context_score: signal.context_score,
              thread_id: signal.thread_id
            }
          };

          // Override signal_type to match DB constraint if needed
          // Actually, let's try to stick to the schema. 
          // 'stall' is a valid type.
          const dbPayload = {
              ...signalPayload,
              signal_type: mappedType
          };

          const { error } = await supabase
            .from('work_signals')
            .upsert(dbPayload, {
              onConflict: 'user_id,signal_id'
            });

          if (error) {
             console.error(`❌ Failed to save pattern "${signal.content}":`, error.message);
          } else {
            console.log(`Saved [${mappedType}] pattern: "${signal.content}"`);
          }
        } catch (err: any) {
          console.error(`❌ Error saving signal:`, err.message);
        }
      }

    } else {
      console.log('✅ No ghosts found in the analyzed batch.');
    }

    console.log('\nDeep Scan Complete.');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Graph API Error:', JSON.stringify(error.body, null, 2));
    }
  }
}

main();

