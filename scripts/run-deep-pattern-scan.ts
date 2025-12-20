
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
}

async function main() {
  console.log('🧠 Deep Pattern Scan (Identity Mirror) Starting...');

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

    // 2. Deep Fetch (Sent Items)
    // We want to analyze the user's OUTPUT, so we fetch from Sent Items.
    console.log(`[Deep Fetch] Retrieving last 500 Sent Items...`);

    let allMessages: EmailMessage[] = [];
    let nextLink = '/me/mailFolders/sentitems/messages' + 
      `?$top=50` + 
      `&$select=id,subject,bodyPreview,sentDateTime` + 
      `&$orderby=sentDateTime desc`;

    let pageCount = 0;
    const MAX_PAGES = 10; // 10 * 50 = 500 emails

    while (nextLink && pageCount < MAX_PAGES) {
      process.stdout.write('.'); // Progress indicator
      
      const response = await client.api(nextLink).get();
      const messages: EmailMessage[] = response.value || [];
      
      // Filter out trivial messages immediately to save memory
      const significantMessages = messages.filter(m => {
        const body = m.bodyPreview || '';
        // Ignore short replies
        if (body.length < 50) return false;
        // Ignore generic automated responses
        if (body.toLowerCase().includes('unsubscribe')) return false;
        return true;
      });

      allMessages = allMessages.concat(significantMessages);
      
      nextLink = response['@odata.nextLink'];
      pageCount++;
    }
    console.log('\n');
    console.log(`[Fetch] Analyzed 500 raw emails. Found ${allMessages.length} substantial messages for analysis.`);

    if (allMessages.length === 0) {
      console.log('❌ No substantial sent emails found.');
      return;
    }

    // 3. Prepare Payload
    // Concatenate messages into a large text block.
    // If it's too huge, we'll take the most recent 100kb roughly.
    const fullText = allMessages.map(m => {
      return `Subject: ${m.subject}\nBody: ${m.bodyPreview}\n---\n`;
    }).join('\n');

    // Token limit safety (rough calc: 1 char ~= 0.25 tokens. 128k tokens ~= 500k chars)
    // We'll cap at 100,000 characters to be safe and fast.
    const textPayload = fullText.slice(0, 100000);

    console.log(`[Analyze] Sending ${textPayload.length} characters to "The Mirror" (GPT-4o)...`);

    // 4. The Mirror Analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert Psychologist and Executive Coach. You are analyzing a user's Sent Email history to build a psychometric profile.
          
          Goal: Tell the user who they are based on how they write.

          Analyze the provided email content for:
          1. **The Superpower**: What is their unique genius? (e.g., "You are a master at de-escalating conflict," or "You have a gift for simplifying complex technical ideas.")
          2. **The Blind Spot**: Where do they get stuck? (e.g., "You tend to over-apologize," or "You get bogged down in details when you should delegate.")
          3. **The Legal Pattern**: specifically look for keywords like "contract", "legal", "dispute", "agreement". How do they handle conflict/negotiation? Are they defensive? Aggressive? Diplomatic?

          Output Format (JSON):
          {
            "superpower": {
              "title": "Short Title",
              "description": "Detailed analysis of their strength with evidence from the text."
            },
            "blind_spot": {
              "title": "Short Title",
              "description": "Detailed analysis of their weakness/pattern."
            },
            "legal_pattern": {
              "title": "Short Title",
              "description": "Analysis of their conflict/negotiation style."
            },
            "topics": ["Topic 1", "Topic 2", "Topic 3"]
          }
          `
        },
        {
          role: 'user',
          content: `Analyze this Sent Email History:\n\n${textPayload}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;
    const parsed = JSON.parse(result || '{}');

    // 5. Display The Report
    console.log('\n🪞 THE MIRROR REPORT\n');
    console.log('==================================================');
    
    if (parsed.superpower) {
      console.log(`\n🌟 THE SUPERPOWER: ${parsed.superpower.title}`);
      console.log(`${parsed.superpower.description}`);
    }

    if (parsed.blind_spot) {
      console.log(`\n👁️  THE BLIND SPOT: ${parsed.blind_spot.title}`);
      console.log(`${parsed.blind_spot.description}`);
    }

    if (parsed.legal_pattern) {
      console.log(`\n⚖️  THE LEGAL PATTERN: ${parsed.legal_pattern.title}`);
      console.log(`${parsed.legal_pattern.description}`);
    }

    if (parsed.topics) {
      console.log(`\n🔥 TOPICS THAT LIGHT YOU UP:`);
      console.log(parsed.topics.join(', '));
    }

    console.log('\n==================================================');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Graph API Error:', JSON.stringify(error.body, null, 2));
    }
  }
}

main();

