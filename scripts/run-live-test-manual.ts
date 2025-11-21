import { GmailPlugin } from '../lib/plugins/gmail/index';
import dotenv from 'dotenv';

// Load Environment Variables
dotenv.config({ path: '.env.local' });

/**
 * Manual Test Script - Use this if you have Google OAuth tokens
 * 
 * Usage:
 *   GOOGLE_ACCESS_TOKEN=your_token GOOGLE_REFRESH_TOKEN=your_refresh npx tsx scripts/run-live-test-manual.ts
 * 
 * Or set them in .env.local:
 *   GOOGLE_ACCESS_TOKEN=...
 *   GOOGLE_REFRESH_TOKEN=...
 */

async function runManualTest() {
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!accessToken || !refreshToken) {
    console.error("❌ Missing Google OAuth tokens!");
    console.error("\n💡 Set them as environment variables:");
    console.error("   GOOGLE_ACCESS_TOKEN=your_token GOOGLE_REFRESH_TOKEN=your_refresh npx tsx scripts/run-live-test-manual.ts");
    console.error("\n   Or add them to .env.local:");
    console.error("   GOOGLE_ACCESS_TOKEN=...");
    console.error("   GOOGLE_REFRESH_TOKEN=...");
    process.exit(1);
  }

  console.log("🔑 Using provided Google OAuth tokens");
  console.log("🔌 Connecting to Gmail...");

  // Prepare the Plugin
  const gmail = new GmailPlugin();
  const credentials = {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 3600 * 1000) // Assume 1 hour from now
  };

  try {
    // Use a dummy user ID since we're not using the database
    await gmail.initialize('manual-test-user', credentials);

    console.log("📨 Scanning last 3 emails from the past 24 hours...");
    const result = await gmail.scan(new Date(Date.now() - 24 * 60 * 60 * 1000));

    console.log("\n🎉 SUCCESS! I CAN READ YOUR EMAILS:");
    console.log("================================================");
    
    if (!result.items || result.items.length === 0) {
      console.log("No emails found in the last 24 hours.");
    } else {
      result.items.slice(0, 3).forEach((item: any, index: number) => {
        console.log(`\n📧 Email ${index + 1}:`);
        console.log(`   Subject: ${item.title}`);
        console.log(`   From:    ${item.author}`);
        console.log(`   Date:    ${item.timestamp}`);
        if (item.snippet) {
          console.log(`   Preview: ${item.snippet.substring(0, 100)}...`);
        }
        console.log("------------------------------------------------");
      });
    }

    console.log(`\n✅ Total emails found: ${result.items?.length || 0}`);
    console.log("🎊 THE MAGIC MOMENT - Your emails are being read!");

  } catch (e: any) {
    console.error("❌ Scan Failed:", e.message);
    console.error("\n💡 Possible issues:");
    console.error("   1. Access token expired - get a fresh one");
    console.error("   2. Refresh token invalid - re-authenticate");
    console.error("   3. Gmail API not enabled in Google Cloud Console");
    console.error("   4. Insufficient permissions (need gmail.readonly scope)");
    if (e.stack) {
      console.error("\nStack trace:", e.stack);
    }
  }
}

runManualTest();

