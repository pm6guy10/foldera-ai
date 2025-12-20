
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { NotionSensor } from '../lib/plugins/notion';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('📓 Notion Analyst (Strategy Gap Detector) Starting...');

  try {
    // 0. Check Environment
    if (!process.env.NOTION_API_KEY) {
        throw new Error('NOTION_API_KEY is missing in .env.local');
    }

    // 1. Find User
    let userId = process.env.TEST_USER_ID;
    if (!userId) {
       // Fallback: Find user with Notion integration if we tracked it, otherwise just use the first user for now
       // or require TEST_USER_ID. Let's try to look up via existing integration logic or just fail if not set.
       // For this task, we'll try to find the same user we used for Outlook.
       const { data: integration } = await supabase
        .from('integrations')
        .select('user_id')
        .eq('provider', 'azure_ad') // Assuming same user has both
        .limit(1)
        .single();
        
       if (integration) {
           userId = integration.user_id;
           console.log(`✅ Found user: ${userId}`);
       } else {
           console.log('⚠️  Could not infer user. Please set TEST_USER_ID.');
           return;
       }
    }

    // 2. Fetch Notion Data (The Plan)
    console.log('[Sensor] Scanning Notion for recent plans...');
    const notion = new NotionSensor();
    const recentPages = await notion.getRecentActivitySummary();
    
    console.log(`[Sensor] Found ${recentPages.length} active Notion pages.`);
    if (recentPages.length === 0) {
        console.log('✅ No recent Notion activity found. Nothing to compare.');
        return;
    }

    const notionContext = recentPages.map(p => `
PAGE: ${p.title} (Edited: ${p.lastEdited})
URL: ${p.url}
UNCHECKED TODOS:
${p.openTodos.map(t => `  [ ] ${t}`).join('\n')}
CONTENT SNIPPET:
${p.contentPreview}
----------------------------------------
`).join('\n');


    // 3. Fetch Outlook Data (The Reality)
    console.log('[Sensor] Fetching recent Outlook "Context" signals...');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: outlookSignals } = await supabase
        .from('work_signals')
        .select('content, context_tags')
        .eq('user_id', userId)
        .eq('source', 'outlook')
        .gt('created_at', threeDaysAgo); // Last 3 days of reality

    // Filter Noise from Outlook Context
    const NOISE_KEYWORDS = [
      'unsubscribe', 'promo', 'order confirmation', 'sale', 'shipped', 'delivery', 
      'receipt', 'amazon', 'uber', 'lyft', 'doordash', 'your order', 'discount', 
      'deal', 'newsletter', 'marketing'
    ];

    const filteredOutlook = (outlookSignals || []).filter(s => {
        const text = (s.content + ' ' + (s.context_tags?.join(' ') || '')).toLowerCase();
        return !NOISE_KEYWORDS.some(keyword => text.includes(keyword));
    });

    const outlookContext = filteredOutlook.map(s => `- ${s.content} (Tags: ${s.context_tags?.join(', ')})`).join('\n') || 'No recent strategic Outlook activity.';


    // 4. Analyze with GPT-4o
    console.log('[Analyze] Sending Plan vs. Reality to "The Strategic Partner"...');
    
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a Strategic Executive Assistant. 
You have access to:
- A list of Key Projects from Notion (e.g., "Legal", "Strategy", "Hiring").
- A batch of recent emails.

Your job is to IGNORE trivial activity:
- Shopping, personal purchases, Crocs, Amazon, retail orders
- Newsletters, promos, marketing blasts, sales
- Routine scheduling that does not affect a Key Project

ONLY flag a "Misalignment" when BOTH are true:
1) The email activity is related to a Key Project found in Notion (e.g., "Legal", "Strategy", "Hiring").
2) There is a meaningful gap between what the user said they would do and what they are actually doing.

If the user is spending time on shopping emails (Crocs, Amazon, etc.), IGNORE IT.
Do NOT mention it. Do NOT create any signal for it.

Output format:
Return a JSON array of WorkSignal objects.
If there is no strategic misalignment, return an empty array [].
Do not invent gaps. Be conservative.

Schema:
{
  "signals": [
    {
      "source": "notion",
      "signal_type": "risk" | "context" | "misalignment", 
      "content": "Short description of the gap (e.g. 'Strategy Gap: Ignoring Project X')",
      "author": "Notion Analyst",
      "context_score": number (1-10, 8+ is critical gap),
      "thread_id": "ID of the Notion Page"
    }
  ]
}`
            },
            {
                role: 'user',
                content: `
=== THE PLANS (NOTION) ===
${notionContext}

=== THE REALITY (OUTLOOK RECENT) ===
${outlookContext}
`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
    });

    const result = completion.choices[0].message.content;
    const parsed = JSON.parse(result || '{}');

    // Post-filter signals to enforce strictness
    const finalSignals = (parsed.signals || []).filter((s: any) => {
        const text = (s.content || '').toLowerCase();
        // Double check for noise
        if (NOISE_KEYWORDS.some(kw => text.includes(kw))) return false;
        if (text.includes('crocs') || text.includes('shopping')) return false;
        return true;
    });

    // 5. Persist
    console.log('\n📊 STRATEGY REPORT:\n');

    if (finalSignals.length > 0) {
        console.log(`[Persist] Saving ${finalSignals.length} strategic insights...`);
        
        // Cleanup old Notion signals
        await supabase
            .from('work_signals')
            .delete()
            .eq('source', 'notion')
            .eq('user_id', userId);

        for (const signal of finalSignals) {
            try {
                // If DB constraint for 'misalignment' doesn't exist, map to 'risk' or 'context'
                // We'll stick to 'risk' for gaps, 'context' for alignment.
                // Assuming schema allows: 'risk', 'commitment', 'stall', 'context', 'opportunity', 'outlook', 'gmail', 'slack', 'linear', 'notion', 'calendar'
                // Wait, source is 'notion', signal_type is restricted.
                // 'misalignment' is NOT in the allowed types likely unless we added it.
                // Allowed types (usually): risk, commitment, stall, context, opportunity.
                // I will map 'misalignment' -> 'risk' (if negative) or 'context' (if neutral).
                
                let mappedType = 'context';
                if (signal.signal_type === 'misalignment' || signal.signal_type === 'risk') {
                    mappedType = 'risk';
                }

                await supabase.from('work_signals').upsert({
                    user_id: userId,
                    signal_id: `notion:${signal.thread_id || Date.now()}`,
                    source: 'notion',
                    author: 'Strategic Partner',
                    content: signal.content,
                    signal_type: mappedType,
                    context_tags: ['Strategy Gap', signal.signal_type],
                    raw_metadata: {
                        original_type: signal.signal_type,
                        score: signal.context_score
                    }
                } as any, { onConflict: 'user_id,signal_id' });

                console.log(`Saved [${mappedType}] signal: "${signal.content}"`);

            } catch (err: any) {
                console.error('Error saving signal:', err.message);
            }
        }
    } else {
        console.log('✅ Perfect alignment. You are working on exactly what you planned.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

main();

