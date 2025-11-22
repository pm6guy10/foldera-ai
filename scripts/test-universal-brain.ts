// =====================================================
// UNIVERSAL BRAIN TEST
// Tests the contradiction detection logic with Sunday Night Scenario
// =====================================================

import dotenv from 'dotenv';
import OpenAI from 'openai';
import { processSignals } from '../lib/ingest/processor';
import { getSundayNightSignals } from './fixtures/sunday-night-scenario';
import type { WorkSignal } from '../lib/types/universal-graph';

// Load Environment Variables
dotenv.config({ path: '.env.local' });

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error("❌ OPENAI_API_KEY not found in .env.local");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: openaiApiKey });

async function testUniversalBrain() {
  console.log("🧠 Universal Brain Test - Sunday Night Scenario");
  console.log("=".repeat(60));
  console.log("");

  // 1. Load test fixture
  console.log("📋 Loading test fixture: Sunday Night Scenario...");
  const signals = getSundayNightSignals();
  console.log(`✅ Loaded ${signals.length} signals`);
  console.log("");

  // Display input signals
  console.log("📥 INPUT SIGNALS:");
  console.log("-".repeat(60));
  signals.forEach((signal, index) => {
    console.log(`\n${index + 1}. [${signal.source.toUpperCase()}] ${signal.id}`);
    console.log(`   Author: ${signal.author}`);
    console.log(`   Timestamp: ${signal.timestamp}`);
    console.log(`   Content: ${signal.content.substring(0, 100)}...`);
  });
  console.log("");

  // 2. Process signals with AI
  console.log("🤖 Processing signals with AI...");
  console.log("   Looking for conflicts, especially Slack vs Calendar...");
  console.log("");

  const { enrichedSignals, result } = await processSignals(signals, openai);

  // 3. Display results
  console.log("=".repeat(60));
  console.log("📊 PROCESSING RESULTS");
  console.log("=".repeat(60));
  console.log(`✅ Success: ${result.success}`);
  console.log(`📈 Signals processed: ${result.signalsProcessed}`);
  console.log(`🔗 Relationships created: ${result.relationshipsCreated}`);
  console.log(`🏷️  Tags generated: ${result.tagsGenerated}`);
  console.log(`⏱️  Processing time: ${result.processingTimeMs}ms`);
  console.log("");

  // 4. Display enriched signals
  console.log("=".repeat(60));
  console.log("📤 ENRICHED SIGNALS");
  console.log("=".repeat(60));
  console.log("");

  enrichedSignals.forEach((signal, index) => {
    console.log(`${index + 1}. [${signal.source.toUpperCase()}] ${signal.id}`);
    console.log(`   Author: ${signal.author}`);
    
    // Display context tags
    if (signal.context_tags && signal.context_tags.length > 0) {
      console.log(`   🏷️  Tags: [${signal.context_tags.join(', ')}]`);
    } else {
      console.log(`   🏷️  Tags: []`);
    }
    
    // Display relationships
    if (signal.relationships && signal.relationships.length > 0) {
      console.log(`   🔗 Relationships:`);
      signal.relationships.forEach((rel) => {
        console.log(`      → ${rel.type}: ${rel.targetId}`);
        console.log(`        Reason: ${rel.reason}`);
      });
    } else {
      console.log(`   🔗 Relationships: []`);
    }
    
    console.log("");
  });

  // 5. Verify expected contradiction
  console.log("=".repeat(60));
  console.log("✅ VERIFICATION");
  console.log("=".repeat(60));
  
  const slackSignal = enrichedSignals.find(s => s.source === 'slack');
  const calendarSignal = enrichedSignals.find(s => s.source === 'calendar');
  
  if (!slackSignal || !calendarSignal) {
    console.log("❌ ERROR: Could not find Slack or Calendar signal");
    return;
  }

  const contradiction = slackSignal.relationships?.find(
    rel => rel.type === 'contradicts' && rel.targetId === calendarSignal.id
  );

  if (contradiction) {
    console.log("✅ SUCCESS: Slack signal has 'contradicts' relationship with Calendar signal!");
    console.log(`   Reason: ${contradiction.reason}`);
  } else {
    console.log("⚠️  WARNING: Expected contradiction not found");
    console.log("   Slack signal relationships:", JSON.stringify(slackSignal.relationships, null, 2));
  }

  // 6. Output full JSON for inspection
  console.log("");
  console.log("=".repeat(60));
  console.log("📄 FULL JSON OUTPUT");
  console.log("=".repeat(60));
  console.log(JSON.stringify(enrichedSignals, null, 2));
}

// Run the test
testUniversalBrain().catch((error) => {
  console.error("❌ Test failed:", error);
  if (error.stack) {
    console.error("\nStack trace:", error.stack);
  }
  process.exit(1);
});
