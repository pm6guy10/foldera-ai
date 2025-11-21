import { createClient } from '@supabase/supabase-js';
import { GmailPlugin } from '../lib/plugins/gmail/index';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { google } from 'googleapis';

// Load Environment Variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing environment variables!");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  console.error("Make sure .env.local exists with these values.");
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey // MUST use Service Role Key to read user data
);

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (openaiApiKey) {
  openai = new OpenAI({ apiKey: openaiApiKey });
} else {
  console.warn("⚠️  OPENAI_API_KEY not found in .env.local - AI analysis will be skipped");
}

async function runLiveTest() {
  console.log("🕵️ Accessing Database...");
  console.log(`📍 Supabase URL: ${supabaseUrl}`);

  // Test connection first and list all users
  try {
    const { data: allUsers, error: testError, count } = await supabase
      .from('meeting_prep_users')
      .select('email, name, updated_at, google_access_token, google_refresh_token', { count: 'exact' });
    
    if (testError) {
      console.error("❌ Database connection failed!");
      console.error("Error details:", testError);
      console.error("\n💡 Possible issues:");
      console.error("   1. Check if Supabase project is active (not paused)");
      console.error("   2. Verify the URL is correct in .env.local");
      console.error("   3. Check your internet connection");
      console.error("   4. Ensure the 'meeting_prep_users' table exists (run migration)");
      return;
    }

    console.log(`📊 Found ${count || 0} user(s) in database`);
    if (allUsers && allUsers.length > 0) {
      console.log("Users in database:");
      allUsers.forEach((u: any, i: number) => {
        console.log(`  ${i + 1}. ${u.email} (${u.name || 'no name'}) - Updated: ${u.updated_at}`);
        console.log(`     Has tokens: ${!!u.google_access_token && !!u.google_refresh_token}`);
      });
    }
  } catch (e: any) {
    console.error("❌ Network error connecting to Supabase!");
    console.error("Error:", e.message);
    console.error("\n💡 This might be a network/firewall issue or the project is paused.");
    return;
  }

  // 1. Get the most recent user who logged in
  const { data: users, error } = await supabase
    .from('meeting_prep_users')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Database query failed!");
    console.error("Error:", error.message);
    return;
  }

  if (!users || users.length === 0) {
    console.error("❌ No user found in database!");
    console.error("\n💡 You need to:");
    console.error("   1. Visit http://localhost:3000/dashboard (or foldera.ai)");
    console.error("   2. Sign in with Google");
    console.error("   3. Grant calendar and email permissions");
    console.error("   4. Then run this script again");
    return;
  }

  const user = users[0];

  console.log(`✅ Found User: ${user.email}`);
  
  if (!user.google_access_token || !user.google_refresh_token) {
    console.error("❌ User doesn't have Google OAuth tokens!");
    console.error("\n💡 You need to:");
    console.error("   1. Visit http://localhost:3000/dashboard (or foldera.ai)");
    console.error("   2. Sign in with Google");
    console.error("   3. Grant calendar and email permissions");
    console.error("   4. Then run this script again");
    return;
  }

  console.log("🔑 Refresh Token acquired.");

  // 2. Prepare the Plugin
  const gmail = new GmailPlugin();
  const credentials = {
    accessToken: user.google_access_token,
    refreshToken: user.google_refresh_token,
    expiresAt: new Date(user.google_token_expires_at)
  };

  // 3. Connect & Scan
  try {
    console.log("🔌 Connecting to Gmail...");
    await gmail.initialize(user.id, credentials);

    console.log("📨 Scanning emails...");
    const result = await gmail.scan(new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24h

    console.log("\n🎉 SUCCESS! I CAN READ YOUR EMAILS:");
    console.log("------------------------------------------------");
    result.items.slice(0, 3).forEach((item: any) => {
      console.log(`Subject: ${item.title}`);
      console.log(`From:    ${item.author}`);
      console.log(`Date:    ${item.timestamp}`);
      console.log("------------------------------------------------");
    });

    // AI Analysis - Hunter-Killer Mode
    if (openai && result.items && result.items.length > 0) {
      console.log("\n⚡ HUNTER-KILLER MODE: Proactive Chief of Staff activated...");
      
      // Process each email individually for better targeting
      const emailsToAnalyze = result.items.slice(0, 5);
      
      // Create Gmail API client once for reuse
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({
        access_token: user.google_access_token,
        refresh_token: user.google_refresh_token,
        expiry_date: new Date(user.google_token_expires_at).getTime(),
      });
      const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Process each email
      for (const emailItem of emailsToAnalyze) {
        try {
          // Get full content and truncate to 1000 chars
          const bodyContent = emailItem.content || emailItem.metadata?.snippet || 'No content available';
          const bodySnippet = bodyContent.length > 1000 ? bodyContent.substring(0, 1000) + '...' : bodyContent;
          
          // Get To field from metadata
          const toEmails = emailItem.metadata?.to || [];
          const toField = toEmails.length > 0 ? toEmails.join(', ') : emailItem.author || 'Unknown';
          
          // Format email clearly for AI
          const emailText = `Subject: ${emailItem.title || 'No subject'}
From: ${emailItem.author || 'Unknown'}
To: ${toField}
Body: ${bodySnippet}`;

          // Analyze with God Mode prompt
          const completion = await openai.chat.completions.create({
            model: 'gpt-5.1',
            messages: [
              {
                role: 'system',
                content: `You are Foldera, an autonomous Chief of Staff. Do not just find problems. Fix them.

Analyze the email and categorize it into one of 3 buckets:

TYPE A: MISSING DELIVERABLE (e.g., 'Where is the deck?', 'You promised the contract')
-> ACTION: Draft a reply that says 'Apologies for the delay, I have attached the file here.' (Simulate that you found it).

TYPE B: SCHEDULING CONFLICT (e.g., 'Can you meet at 2?', 'Are we on?')
-> ACTION: Draft a reply that asserts control. 'Confirmed for 2pm.' or 'I have a conflict at 2pm, proposing 2:30pm instead.'

TYPE C: OPEN LOOP (e.g., 'Did you see my last email?')
-> ACTION: Draft a reply that closes the loop. 'Yes, I reviewed it. We are good to go.'

OUTPUT FORMAT (JSON ONLY):
{
  "risk_detected": boolean,
  "category": "DELIVERABLE" | "SCHEDULING" | "OPEN_LOOP" | "NONE",
  "explanation": "One sentence on why this is a risk.",
  "draft_subject": "Re: [Original Subject]",
  "draft_body": "The full, professional email body ready to send. Do not include placeholders like '[Insert name]'. Use the name found in the email or 'there'. Be direct, executive, brief. No AI disclaimers."
}`
              },
              {
                role: 'user',
                content: emailText
              }
            ],
            temperature: 0.7,
            max_completion_tokens: 1000,
            response_format: { type: "json_object" }
          });

          const aiResponse = completion.choices[0]?.message?.content || 'No response from AI';
          
          // Parse JSON response
          try {
            let jsonText = aiResponse.trim();
            if (jsonText.includes('```json')) {
              jsonText = jsonText.split('```json')[1].split('```')[0].trim();
            } else if (jsonText.includes('```')) {
              jsonText = jsonText.split('```')[1].split('```')[0].trim();
            }
            
            const analysis = JSON.parse(jsonText);
            
            if (analysis.risk_detected && analysis.category !== "NONE") {
              // Display proactive fix box
              console.log("\n" + "═".repeat(60));
              console.log(`⚡ PROACTIVE FIX: ${analysis.category}`);
              console.log("═".repeat(60));
              console.log(`📧 Email: ${emailItem.title || 'No subject'}`);
              console.log(`📝 Explanation: ${analysis.explanation}`);
              console.log("═".repeat(60));
              
              // Create draft
              const threadId = emailItem.metadata?.threadId || emailItem.id;
              const replyTo = emailItem.author || emailItem.metadata?.from || toField;
              
              // Build email message
              const emailLines = [
                `To: ${replyTo}`,
                `Subject: ${analysis.draft_subject || `Re: ${emailItem.title || 'No subject'}`}`,
                `Content-Type: text/plain; charset=utf-8`,
                `Content-Transfer-Encoding: 7bit`,
                '',
                analysis.draft_body
              ];
              
              const email = emailLines.join('\r\n');
              const encoded = Buffer.from(email)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
              
              try {
                const draftResponse = await gmailClient.users.drafts.create({
                  userId: 'me',
                  requestBody: {
                    message: {
                      raw: encoded,
                      threadId: threadId,
                    },
                  },
                });
                
                console.log(`✨ Draft created in Gmail. ID: ${draftResponse.data.id}`);
                console.log(`📬 Check your Gmail drafts folder.\n`);
              } catch (draftError: any) {
                console.error("❌ Failed to create draft:", draftError.message);
                if (draftError.message.includes('insufficient')) {
                  console.error("💡 Make sure you've granted Gmail compose permission and re-authenticated.\n");
                }
              }
            } else {
              console.log(`✅ ${emailItem.title || 'Email'}: No action needed (${analysis.category || 'NONE'})\n`);
            }
          } catch (parseError: any) {
            console.error(`❌ Failed to parse AI response for "${emailItem.title}":`, parseError.message);
            console.error("Raw response:", aiResponse.substring(0, 200) + "...\n");
          }
        } catch (emailError: any) {
          console.error(`❌ Error processing email "${emailItem.title}":`, emailError.message);
        }
      }

    } else if (!openai) {
      console.log("\n⚠️  Skipping AI analysis - OPENAI_API_KEY not configured");
    }

  } catch (e) {
    console.error("❌ Scan Failed:", e);
  }
}

runLiveTest();

