import { createClient } from '@supabase/supabase-js';
import { GmailPlugin } from '../lib/plugins/gmail/index';
import { processSignals } from '../lib/ingest/processor';
import type { WorkSignal } from '../lib/types/universal-graph';
import dotenv from 'dotenv';
import OpenAI from 'openai';

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

async function testUniversalBrain() {
  console.log("🧠 Testing Universal Context Engine");
  console.log("=".repeat(60));

  // 1. THE SOURCE: Get user from database
  const { data: users, error } = await supabase
    .from('meeting_prep_users')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !users || users.length === 0) {
    console.error("❌ No user found in database!");
    return;
  }

  const user = users[0];
  console.log(`✅ Found User: ${user.email}`);

  if (!user.google_access_token || !user.google_refresh_token) {
    console.error("❌ User doesn't have Google OAuth tokens!");
    return;
  }

  // 2. THE SOURCE: Initialize Gmail Plugin and fetch last 10 emails
  console.log("\n📧 THE SOURCE: Fetching last 10 emails from Gmail...");
  
  const gmail = new GmailPlugin();
  const credentials = {
    accessToken: user.google_access_token,
    refreshToken: user.google_refresh_token,
    expiresAt: new Date(user.google_token_expires_at)
  };

  try {
    await gmail.initialize(user.id, credentials);
    
    const scanResult = await gmail.scan(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Last 7 days
    const emails = scanResult.items.slice(0, 10); // Get last 10
    
    console.log(`✅ Fetched ${emails.length} emails`);

    if (emails.length === 0) {
      console.log("⚠️  No emails found to process");
      return;
    }

    // 3. THE NORMALIZER: Convert emails to WorkSignal format
    console.log("\n🔄 THE NORMALIZER: Converting emails to WorkSignal format...");
    
    const signals: WorkSignal[] = emails.map((email: any, index: number) => {
      // Map email fields to WorkSignal
      const subject = email.title || 'No subject';
      const body = email.content || email.metadata?.snippet || '';
      const content = `${subject}\n\n${body}`;
      
      // Create Gmail URL
      const emailId = email.id || email.metadata?.messageId || `msg_${index}`;
      const url = `https://mail.google.com/mail/u/0/#inbox/${emailId}`;
      
      return {
        id: `gmail:${emailId}`,
        source: 'gmail' as const,
        author: email.author || email.metadata?.from || 'Unknown',
        timestamp: email.timestamp || new Date(),
        url: url,
        content: content.substring(0, 2000), // Limit content length
        summary: '', // Will be filled by AI
        status: 'OPEN' as const,
        priority: 'MEDIUM' as const,
      };
    });

    console.log(`✅ Normalized ${signals.length} emails into WorkSignal format`);

    // Display normalized signals
    console.log("\n📋 Normalized Signals:");
    signals.forEach((signal, index) => {
      const preview = signal.content.substring(0, 60).replace(/\n/g, ' ');
      console.log(`  ${index + 1}. [${signal.source}] ${signal.author} - "${preview}..."`);
    });

    // 4. THE BRAIN: Process signals with AI
    console.log("\n🤖 THE BRAIN: Processing signals with AI...");
    console.log("   Analyzing connections and generating context tags...\n");

    const { enrichedSignals, result } = await processSignals(signals, openai);

    console.log(`✅ Processing complete!`);
    console.log(`   - Signals processed: ${result.signalsProcessed}`);
    console.log(`   - Relationships created: ${result.relationshipsCreated}`);
    console.log(`   - Tags generated: ${result.tagsGenerated}`);
    console.log(`   - Processing time: ${result.processingTimeMs}ms\n`);

    // 5. THE OUTPUT: Display results
    console.log("=".repeat(60));
    console.log("📊 OUTPUT: Context Tags & Relationships");
    console.log("=".repeat(60) + "\n");

    enrichedSignals.forEach((signal, index) => {
      const title = signal.content.split('\n')[0] || signal.summary || 'No title';
      const titlePreview = title.substring(0, 50);
      
      console.log(`📧 [${signal.source.toUpperCase()}] "${titlePreview}"`);
      console.log(`   Author: ${signal.author}`);
      
      // Display tags
      if (signal.context_tags && signal.context_tags.length > 0) {
        console.log(`   🏷️  TAGS: [${signal.context_tags.join(', ')}]`);
      } else {
        console.log(`   🏷️  TAGS: [None yet, looking for connections...]`);
      }
      
      // Display relationships
      if (signal.relationships && signal.relationships.length > 0) {
        console.log(`   🔗 LINKS:`);
        signal.relationships.forEach((rel) => {
          const reason = rel.reason ? ` (${rel.reason})` : '';
          console.log(`      → ${rel.type}: ${rel.targetId}${reason}`);
        });
      } else {
        console.log(`   🔗 LINKS: [None yet, looking for connections...]`);
      }
      
      // Display summary if generated
      if (signal.summary) {
        console.log(`   📝 Summary: ${signal.summary}`);
      }
      
      console.log("");
    });

    // Display summary statistics
    console.log("=".repeat(60));
    console.log("📈 SUMMARY STATISTICS");
    console.log("=".repeat(60));
    
    const allTags = enrichedSignals
      .flatMap(s => s.context_tags || [])
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const topTags = Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log(`\n🔝 Top Context Tags:`);
    topTags.forEach(([tag, count]) => {
      console.log(`   - ${tag}: ${count} signal(s)`);
    });
    
    const totalRelationships = enrichedSignals.reduce(
      (sum, s) => sum + (s.relationships?.length || 0),
      0
    );
    console.log(`\n🔗 Total Relationships Discovered: ${totalRelationships}`);
    
    if (totalRelationships > 0) {
      console.log(`\n✅ SUCCESS: The AI successfully connected ${totalRelationships} signals!`);
    } else {
      console.log(`\n💡 No relationships found yet. This is normal for unrelated emails.`);
      console.log(`   Try processing a mix of emails, Slack messages, and Linear tickets for better connections.`);
    }

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
  }
}

testUniversalBrain();

