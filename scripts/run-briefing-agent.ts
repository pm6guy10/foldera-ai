// =====================================================
// THE BRIEFING AGENT
// Pivoted from Dashboard Page to Gmail Draft
// Sunday Night: Queries Knowledge Graph, Generates Briefing, Creates Gmail Draft
// =====================================================

import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { generateBriefingContent } from '../lib/intelligence/briefing-generator';
import { getMeetingPrepUserById } from '../lib/meeting-prep/auth';
import { sendEmail } from '../lib/plugins/gmail-sender';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Validate required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing environment variables!');
  console.error(`Required: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Hardcode your userId for testing (replace with your actual Supabase user ID)
// TODO: In production, this would be passed as an argument or fetched per user
const TEST_USER_ID = process.env.TEST_USER_ID || '';

/**
 * Main Execution
 */
async function main() {
  try {
    console.log('\n🚀 THE BRIEFING AGENT - Starting execution...\n');

    // STEP 1: Get user
    let userId: string;
    let userEmail: string;

    if (TEST_USER_ID) {
      // Use hardcoded user ID for testing
      userId = TEST_USER_ID;
      const user = await getMeetingPrepUserById(userId);
      if (!user) {
        console.error('❌ User not found with ID:', userId);
        process.exit(1);
      }
      userEmail = user.email;
      console.log(`✅ Using hardcoded user: ${userEmail} (ID: ${userId})\n`);
    } else {
      // Fallback: Get first active user
      const { data: users, error: usersError } = await supabase
        .from('meeting_prep_users')
        .select('id, email')
        .not('google_access_token', 'is', null)
        .not('google_refresh_token', 'is', null)
        .limit(1);

      if (usersError || !users || users.length === 0) {
        console.error('❌ No users found with Google credentials');
        console.error('Error:', usersError?.message || 'No users returned');
        console.error('💡 Tip: Set TEST_USER_ID environment variable to hardcode your user ID');
        process.exit(1);
      }

      const user = users[0];
      userId = user.id;
      userEmail = user.email;
      console.log(`✅ Found user: ${userEmail} (ID: ${userId})\n`);
    }

    // STEP 2: Generate Briefing Content
    console.log('📊 STEP 2: Generating briefing content...\n');
    
    const content = await generateBriefingContent(
      userId,
      supabase,
      openai
    );

    console.log(`✅ Briefing generated:`);
    console.log(`   Subject: ${content.subject}`);
    console.log(`   HTML Body length: ${content.htmlBody.length} chars\n`);

    // STEP 3: Send Email
    console.log('📬 STEP 3: Sending email...\n');
    
    const messageId = await sendEmail(
      userId,
      userEmail,
      content.subject,
      content.htmlBody
    );

    if (!messageId) {
      console.error('❌ Failed to send email');
      process.exit(1);
    }

    console.log(`✅ Briefing sent to ${userEmail}!`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Subject: ${content.subject}\n`);

    console.log('🎉 THE BRIEFING AGENT - Execution complete!\n');

  } catch (error: any) {
    console.error('\n❌ THE BRIEFING AGENT - Execution failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();

