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

    // AI Analysis
    if (openai && result.items && result.items.length > 0) {
      console.log("\n🧠 Analyzing emails with AI...");
      
      // Format the last 5 emails with 500 char body snippets
      const emailsToAnalyze = result.items.slice(0, 5);
      const emailsText = emailsToAnalyze.map((item: any, index: number) => {
        // Get full content (from WorkItem.content) and truncate to 500 chars
        const bodyContent = item.content || item.metadata?.snippet || item.snippet || item.body || 'No content available';
        const bodySnippet = bodyContent.length > 500 ? bodyContent.substring(0, 500) + '...' : bodyContent;
        
        return `Email ${index + 1}:
Subject: ${item.title || 'No subject'}
From: ${item.author || 'Unknown'}
Date: ${item.timestamp || 'Unknown'}
Body Snippet: ${bodySnippet}
---`;
      }).join('\n\n');

      // LOGGING: Show raw email body snippets before sending to AI
      console.log("\n📋 RAW EMAIL BODY SNIPPETS (for debugging):");
      console.log("=".repeat(60));
      emailsToAnalyze.forEach((item: any, index: number) => {
        const bodyContent = item.content || item.metadata?.snippet || item.snippet || item.body || 'No content available';
        const bodySnippet = bodyContent.length > 500 ? bodyContent.substring(0, 500) + '...' : bodyContent;
        console.log(`\nEmail ${index + 1} - ${item.title || 'No subject'}:`);
        console.log(bodySnippet);
        console.log("-".repeat(60));
      });
      console.log("=".repeat(60) + "\n");

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-5.1',
          messages: [
            {
              role: 'system',
              content: "You are a paranoid Operations Engine. Your job is to detect OBLIGATIONS and generate reply drafts.\n\nScan these emails for:\n\n1. PROMISES made by the sender or recipient (e.g., 'I will', 'I promise', 'I'll send').\n\n2. QUESTIONS that require a reply (e.g., 'Are we good for 2pm?').\n\n3. DEADLINES (e.g., 'by tomorrow').\n\nIf a RISK is detected (like a missing promise or deadline), generate a polite, professional REPLY email body that addresses it.\n\nOutput MUST be valid JSON in this format:\n{\n  \"risk\": \"[The specific promise or deadline found]\",\n  \"hasDraft\": true,\n  \"replyBody\": \"[Professional reply email body addressing the risk]\"\n}\n\nIf no risk is detected, use:\n{\n  \"risk\": \"None\",\n  \"hasDraft\": false,\n  \"replyBody\": \"\"\n}\n\nBe concise and professional in the reply body."
            },
            {
              role: 'user',
              content: emailsText
            }
          ],
          temperature: 0.7,
          max_completion_tokens: 1000,
          response_format: { type: "json_object" }
        });

        const aiResponse = completion.choices[0]?.message?.content || 'No response from AI';
        
        // Display in a formatted box
        console.log("\n" + "═".repeat(60));
        console.log("🧠 AI ANALYST REPORT");
        console.log("═".repeat(60));
        console.log(aiResponse);
        console.log("═".repeat(60) + "\n");

        // Parse JSON response
        try {
          // Try to extract JSON if response contains markdown code blocks
          let jsonText = aiResponse.trim();
          if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim();
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim();
          }
          
          const analysis = JSON.parse(jsonText);
          
          if (analysis.hasDraft && analysis.replyBody && analysis.risk !== "None") {
            console.log("🔧 SOLVER MODE: Risk detected, creating draft reply...");
            
            // Find the email that contains the risk (use first email for now)
            const riskEmail = emailsToAnalyze[0];
            const threadId = riskEmail.metadata?.threadId || riskEmail.id;
            const toEmail = riskEmail.author || riskEmail.metadata?.from;
            const subject = riskEmail.title?.startsWith('Re:') ? riskEmail.title : `Re: ${riskEmail.title || 'No subject'}`;
            
            // Create Gmail API client
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({
              access_token: user.google_access_token,
              refresh_token: user.google_refresh_token,
              expiry_date: new Date(user.google_token_expires_at).getTime(),
            });
            
            const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
            
            // Build email message
            const emailLines = [
              `To: ${toEmail}`,
              `Subject: ${subject}`,
              `Content-Type: text/plain; charset=utf-8`,
              `Content-Transfer-Encoding: 7bit`,
              '',
              analysis.replyBody
            ];
            
            const email = emailLines.join('\r\n');
            const encoded = Buffer.from(email)
              .toString('base64')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '');
            
            // Create draft
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
              
              console.log(`✨ MAGIC: Draft created for email "${riskEmail.title}"! Check your Gmail drafts.`);
              console.log(`   Draft ID: ${draftResponse.data.id}`);
              console.log(`   Risk addressed: ${analysis.risk}`);
            } catch (draftError: any) {
              console.error("❌ Failed to create draft:", draftError.message);
              if (draftError.message.includes('insufficient')) {
                console.error("💡 Make sure you've granted Gmail compose permission and re-authenticated.");
              }
            }
            
          } else {
            console.log("✅ No risks requiring drafts detected.");
          }
        } catch (parseError: any) {
          console.error("❌ Failed to parse AI response as JSON:", parseError.message);
          console.error("Raw response:", aiResponse);
        }

      } catch (aiError: any) {
        console.error("❌ AI Analysis Failed:", aiError.message);
        if (aiError.message.includes('model')) {
          console.error("💡 Tip: The model name might be incorrect. Try 'gpt-4o' or 'o1' if 'gpt-5.1' doesn't work.");
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

