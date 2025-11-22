// =====================================================
// THE SUNDAY SIMULATOR
// End-to-End Test: The Complete "Sunday Night Cure" Pipeline
// Ingest → Process → Save → Generate → Send
// =====================================================

import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getSundayNightSignals } from './fixtures/sunday-night-scenario';
import { processSignals, saveSignalsToDb } from '../lib/ingest/processor';
import { generateBriefingContent } from '../lib/intelligence/briefing-generator';
import { sendEmail } from '../lib/plugins/gmail-sender';

// Load .env.local
dotenv.config({ path: '.env.local' });

// Setup: Validate required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables!');
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

// Get user email (default to b.kapp1010@gmail.com for testing)
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'b.kapp1010@gmail.com';
const TEST_USER_NAME = process.env.TEST_USER_NAME || 'pm6guy10';

/**
 * Get or Create User
 * Fetches user by email, or creates one if it doesn't exist
 */
async function getOrCreateUser(email: string, name: string): Promise<{ id: string; email: string; name: string | null }> {
  // Try to fetch existing user
  const { data: existingUser, error: fetchError } = await supabase
    .from('meeting_prep_users')
    .select('id, email, name')
    .eq('email', email)
    .single();

  if (existingUser && !fetchError) {
    console.log(`✅ Found existing user: ${existingUser.email} (ID: ${existingUser.id})`);
    return {
      id: existingUser.id,
      email: existingUser.email,
      name: existingUser.name
    };
  }

  // User doesn't exist, create it
  console.log(`👤 User not found. Creating new user: ${email}...`);
  
  const { data: newUser, error: createError } = await supabase
    .from('meeting_prep_users')
    .insert({
      email: email,
      name: name,
      settings: {
        notification_timing_minutes: 30,
        email_notifications: true,
        briefing_detail_level: 'detailed',
        timezone: 'America/Los_Angeles'
      }
    })
    .select('id, email, name')
    .single();

  if (createError || !newUser) {
    throw new Error(`Failed to create user: ${createError?.message || 'Unknown error'}`);
  }

  console.log(`✅ Created new user: ${newUser.email} (ID: ${newUser.id})`);
  console.log(`⚠️  Note: This user needs Google OAuth tokens to send emails.`);
  console.log(`   Sign in via the app to authenticate Google account.\n`);

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name
  };
}

/**
 * Main Execution: The Sunday Night Cure Pipeline
 */
async function main() {
  try {
    console.log('\n🌙 THE SUNDAY SIMULATOR - Starting End-to-End Test\n');
    console.log('='.repeat(60));
    console.log('Pipeline: Ingest → Process → Save → Generate → Send');
    console.log('='.repeat(60));
    
    // Get or create user
    console.log(`\n👤 Getting user: ${TEST_USER_EMAIL}...\n`);
    const user = await getOrCreateUser(TEST_USER_EMAIL, TEST_USER_NAME);
    const TEST_USER_ID = user.id;
    
    console.log(`✅ Using user: ${user.email} (ID: ${TEST_USER_ID})\n`);

    // ============================================
    // STEP 1: INGEST (The Brain)
    // ============================================
    console.log('🧠 STEP 1: The Brain - Ingesting Signals...\n');
    
    const signals = getSundayNightSignals();
    console.log(`📥 Loaded ${signals.length} mock signal(s) from Sunday Night Scenario`);
    signals.forEach((signal, index) => {
      console.log(`   ${index + 1}. ${signal.source.toUpperCase()}: ${signal.author} - ${signal.content.substring(0, 50)}...`);
    });
    
    console.log('\n🤖 Processing signals with AI...');
    const { enrichedSignals, result } = await processSignals(signals, openai);
    
    console.log(`✅ Brain processed ${result.signalsProcessed} signal(s)`);
    console.log(`   - Relationships created: ${result.relationshipsCreated}`);
    console.log(`   - Tags generated: ${result.tagsGenerated}`);
    console.log(`   - Processing time: ${result.processingTimeMs}ms\n`);

    // ============================================
    // STEP 2: MEMORY (The Cortex)
    // ============================================
    console.log('💾 STEP 2: The Cortex - Saving to Supabase...\n');
    
    const saveResult = await saveSignalsToDb(enrichedSignals, TEST_USER_ID, supabase);
    
    if (!saveResult.success) {
      throw new Error(`Failed to save signals: ${saveResult.errors?.join(', ')}`);
    }
    
    console.log(`✅ Signals saved to Supabase`);
    console.log(`   - ${saveResult.signalsSaved} signal(s) persisted`);
    console.log(`   - ${saveResult.relationshipsSaved} relationship(s) stored in Knowledge Graph\n`);

    // ============================================
    // STEP 3: ACTION (The Agent)
    // ============================================
    console.log('📧 STEP 3: The Agent - Generating & Sending Briefing...\n');
    
    console.log('📊 Generating briefing content...');
    const briefingContent = await generateBriefingContent(
      TEST_USER_ID,
      supabase,
      openai
    );
    
    console.log(`✅ Briefing generated: "${briefingContent.subject}"`);
    console.log(`   - HTML Body length: ${briefingContent.htmlBody.length} chars\n`);
    
    console.log('📬 Sending email...');
    const messageId = await sendEmail(
      TEST_USER_ID,
      user.email,
      briefingContent.subject,
      briefingContent.htmlBody
    );
    
    if (!messageId) {
      throw new Error('Failed to send email - no message ID returned');
    }
    
    console.log(`🚀 Email sent successfully!`);
    console.log(`   - Message ID: ${messageId}`);
    console.log(`   - To: ${user.email}`);
    console.log(`   - Subject: ${briefingContent.subject}\n`);

    // ============================================
    // SUCCESS SUMMARY
    // ============================================
    console.log('='.repeat(60));
    console.log('🎉 THE SUNDAY NIGHT CURE - Pipeline Complete!');
    console.log('='.repeat(60));
    console.log(`\n✅ All steps completed successfully:`);
    console.log(`   1. ✅ Brain processed ${result.signalsProcessed} signal(s)`);
    console.log(`   2. ✅ Cortex saved signals to Knowledge Graph`);
    console.log(`   3. ✅ Narrator generated briefing`);
    console.log(`   4. ✅ Courier delivered email to ${user.email}`);
    console.log(`\n📱 Check your inbox! You should see:`);
    console.log(`   "${briefingContent.subject}"`);
    console.log('\n');

  } catch (error: any) {
    console.error('\n❌ THE SUNDAY SIMULATOR - Pipeline Failed:');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\n');
    process.exit(1);
  }
}

// Execute the simulation
main();

