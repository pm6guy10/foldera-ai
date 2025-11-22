// =====================================================
// PERSISTENCE TEST - Phase 3.1: The Cortex
// Tests saving WorkSignals and Relationships to database
// =====================================================

import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { processSignals, saveSignalsToDb } from '../lib/ingest/processor';
import { getSundayNightSignals } from './fixtures/sunday-night-scenario';
import type { WorkSignal } from '../lib/types/universal-graph';

// Load Environment Variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing environment variables!");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("❌ OPENAI_API_KEY not found in .env.local");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });

async function testPersistence() {
  console.log("🧠 Universal Brain - Persistence Test");
  console.log("Phase 3.1: The Cortex (Persistence Layer)");
  console.log("=".repeat(60));
  console.log("");

  // Get a test user ID
  // For testing, we'll use the first user from meeting_prep_users
  console.log("👤 Fetching test user...");
  const { data: users, error: userError } = await supabase
    .from('meeting_prep_users')
    .select('id, email')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (userError || !users || users.length === 0) {
    console.error("❌ No user found in database!");
    console.error("💡 Make sure you have at least one user in meeting_prep_users table");
    process.exit(1);
  }

  const testUserId = users[0].id;
  const testUserEmail = users[0].email;

  console.log(`✅ Using test user: ${testUserEmail} (${testUserId})`);
  console.log("");

  // 1. Load test fixture
  console.log("📋 STEP 1: Loading test fixture...");
  const signals = getSundayNightSignals();
  console.log(`✅ Loaded ${signals.length} signals from Sunday Night Scenario`);
  console.log("");

  // 2. Process signals with AI (The Brain)
  console.log("🤖 STEP 2: Processing signals with AI (The Brain)...");
  console.log("   Analyzing conflicts and relationships...");
  console.log("");

  const { enrichedSignals, result } = await processSignals(signals, openai);

  console.log(`✅ Processing complete!`);
  console.log(`   - Signals processed: ${result.signalsProcessed}`);
  console.log(`   - Relationships created: ${result.relationshipsCreated}`);
  console.log(`   - Tags generated: ${result.tagsGenerated}`);
  console.log(`   - Processing time: ${result.processingTimeMs}ms`);
  console.log("");

  // 3. Save to database (The Cortex / Memory)
  console.log("💾 STEP 3: Saving to database (The Cortex)...");
  console.log("   Persisting signals and relationships...");
  console.log("");

  const saveResult = await saveSignalsToDb(enrichedSignals, testUserId, supabase);

  if (saveResult.success) {
    console.log("✅ Signals saved to DB!");
    console.log(`   - Signals saved: ${saveResult.signalsSaved}`);
    console.log(`   - Relationships saved: ${saveResult.relationshipsSaved}`);
    console.log("");

    // 4. Verify persistence by querying back
    console.log("🔍 STEP 4: Verifying persistence...");
    
    const { data: savedSignals, error: queryError } = await supabase
      .from('work_signals')
      .select('id, signal_id, source, author, context_tags')
      .eq('user_id', testUserId)
      .in('signal_id', enrichedSignals.map(s => s.id))
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error("❌ Error querying saved signals:", queryError.message);
    } else if (savedSignals && savedSignals.length > 0) {
      console.log(`✅ Verification: Found ${savedSignals.length} saved signal(s) in database`);
      console.log("");
      console.log("📊 Saved Signals:");
      savedSignals.forEach((signal, index) => {
        console.log(`   ${index + 1}. [${signal.source}] ${signal.signal_id}`);
        console.log(`      Author: ${signal.author}`);
        console.log(`      Tags: [${signal.context_tags?.join(', ') || 'None'}]`);
        console.log(`      DB ID: ${signal.id}`);
        console.log("");
      });
    }

    // Query relationships
    if (savedSignals && savedSignals.length > 0) {
      const signalDbIds = savedSignals.map(s => s.id);
      
      const { data: relationships, error: relError } = await supabase
        .from('signal_relationships')
        .select(`
          id,
          relationship_type,
          reason,
          source_signal:work_signals!source_signal_id(signal_id, source),
          target_signal:work_signals!target_signal_id(signal_id, source)
        `)
        .in('source_signal_id', signalDbIds);

      if (!relError && relationships && relationships.length > 0) {
        console.log("🔗 Saved Relationships:");
        relationships.forEach((rel: any, index: number) => {
          const source = rel.source_signal?.signal_id || 'unknown';
          const target = rel.target_signal?.signal_id || 'unknown';
          console.log(`   ${index + 1}. ${source} --[${rel.relationship_type}]--> ${target}`);
          console.log(`      Reason: ${rel.reason}`);
          console.log("");
        });
      }
    }

    console.log("=".repeat(60));
    console.log("✅ SUCCESS: The Cortex is working!");
    console.log("=".repeat(60));
    console.log("");
    console.log("💡 Next steps:");
    console.log("   - Query the graph: 'Show me everything that blocks Project Phoenix'");
    console.log("   - Build dashboard views to visualize the knowledge graph");
    console.log("   - Add real-time updates when new signals arrive");

  } else {
    console.error("❌ Failed to save signals to database");
    if (saveResult.errors) {
      console.error("Errors:", saveResult.errors);
    }
    process.exit(1);
  }
}

// Run the test
testPersistence().catch((error) => {
  console.error("❌ Test failed:", error);
  if (error.stack) {
    console.error("\nStack trace:", error.stack);
  }
  process.exit(1);
});

