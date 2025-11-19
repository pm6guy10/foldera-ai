// scripts/test-ignition.ts
import { GmailPlugin } from '../lib/plugins/gmail/index';
import { PluginCredentials } from '../lib/types/work-item';

async function startEngine() {
  console.log("🔑 Inserting Ignition Key...");

  // 1. Instantiate the Plugin (The Ferrari)
  const gmail = new GmailPlugin();

  // 2. The Fuel (Credentials)
  // In production, you pull these from the DB.
  // For this test, we need to know if you have them.
  const mockCreds: PluginCredentials = {
    accessToken: "YOUR_ACCESS_TOKEN_HERE", // We will fix this in a second
    refreshToken: "YOUR_REFRESH_TOKEN_HERE",
    expiresAt: new Date(Date.now() + 3600 * 1000)
  };

  const userId = "test-user-001";

  try {
    // 3. Initialize
    console.log("🔌 Connecting to Gmail...");
    await gmail.initialize(userId, mockCreds);

    // 4. Check Health
    const isHealthy = await gmail.isHealthy();
    console.log(`🏥 System Health: ${isHealthy ? 'HEALTHY' : 'SICK'}`);

    if (isHealthy) {
      // 5. The Magic: Scan for Risks
      console.log("🕵️ Scanning for emails...");
      const result = await gmail.scan(new Date(Date.now() - 86400 * 1000)); // Last 24 hours
      console.log("✅ Scan Complete!");
      console.log(`📊 Found ${result.itemCount} items.`);
      console.log(JSON.stringify(result.items, null, 2));
    }

  } catch (error) {
    console.error("❌ Engine Stalled:", error);
  }
}

startEngine();

