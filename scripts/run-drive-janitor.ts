import { createClient } from '@supabase/supabase-js';
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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = null;

if (openaiApiKey) {
  openai = new OpenAI({ apiKey: openaiApiKey });
} else {
  console.error("❌ OPENAI_API_KEY not found in .env.local");
  process.exit(1);
}

async function runDriveJanitor() {
  console.log("🧹 Foldera 2.0: The Autonomous Janitor");
  console.log("=".repeat(60));

  // 1. Get the most recent user
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

  // 2. THE OBSERVER: Connect to Google Drive API
  console.log("\n📁 THE OBSERVER: Scanning Google Drive root directory...");
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: new Date(user.google_token_expires_at).getTime(),
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // Scan root directory for loose files (not folders)
    // Query: files in root that are not folders, ordered by created date
    const driveResponse = await drive.files.list({
      q: "'root' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'",
      fields: 'files(id, name, mimeType, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 20, // Last 20 loose files
    });

    const files = driveResponse.data.files || [];

    if (files.length === 0) {
      console.log("✅ No loose files found in root directory. Drive is clean!");
      return;
    }

    console.log(`📋 Found ${files.length} loose files in root directory`);

    // Format files for AI
    const filesList = files.map((file, index) => ({
      file_name: file.name || 'Untitled',
      id: file.id || '',
      mime_type: file.mimeType || 'unknown',
      created_date: file.createdTime || 'unknown',
    }));

    // 3. THE JANITOR: AI Logic
    console.log("\n🤖 THE JANITOR: Analyzing files and proposing organization...");

    const filesText = filesList.map((f, i) => 
      `${i + 1}. ${f.file_name} (${f.mime_type}) - Created: ${f.created_date}`
    ).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: `You are an expert Digital Organizer (The Janitor).

Look at these loose files found in the root directory.

Propose a logical folder structure to clean them up.

Group them by context (e.g., 'Financials', 'Legal', 'Images', 'Project Phoenix').

OUTPUT JSON:
{
  "summary": "I found [X] loose files and organized them into [Y] categories.",
  "proposed_moves": [
    { "file_name": "invoice_2024.pdf", "reason": "Finance", "target_folder": "Finance/Invoices" },
    ...
  ]
}`
        },
        {
          role: 'user',
          content: `Here are the loose files in the root directory:\n\n${filesText}`
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    
    // Parse JSON response
    let jsonText = aiResponse.trim();
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }

    const janitorPlan = JSON.parse(jsonText);

    console.log(`✅ ${janitorPlan.summary || 'Plan generated'}`);

    // Group moves by folder for display
    const movesByFolder: Record<string, string[]> = {};
    janitorPlan.proposed_moves?.forEach((move: any) => {
      const folder = move.target_folder || 'Uncategorized';
      if (!movesByFolder[folder]) {
        movesByFolder[folder] = [];
      }
      movesByFolder[folder].push(move.file_name);
    });

    // 4. THE APPROVER: Construct HTML Email
    console.log("\n📧 THE APPROVER: Constructing approval email...");

    const fileCount = files.length;
    const categoryCount = Object.keys(movesByFolder).length;

    // Build folder list HTML
    const folderListHtml = Object.entries(movesByFolder)
      .map(([folder, fileNames]) => {
        const fileList = fileNames.slice(0, 3).join(', ');
        const moreCount = fileNames.length > 3 ? ` (+${fileNames.length - 3} more)` : '';
        return `<p><strong>📂 ${folder}:</strong> ${fileNames.length} files (${fileList}${moreCount})</p>`;
      })
      .join('\n');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .button:hover { background-color: #0056b3; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🧹 Tidy Up: I found ${fileCount} loose files in your Drive</h2>
    
    <p>Hi Boss,</p>
    
    <p>I noticed your root folder is getting messy. I found <strong>${fileCount} files</strong> that don't belong there.</p>
    
    <h3>Here is my cleanup plan:</h3>
    
    ${folderListHtml}
    
    <a href="https://foldera.ai/api/execute?plan_id=123" class="button">APPROVE CLEANUP</a>
    
    <p class="footer">If you don't click approve, I won't touch anything.</p>
  </div>
</body>
</html>
    `.trim();

    // 5. EXECUTION: Send email via Gmail
    console.log("\n📬 Sending approval email...");

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build email message
    const emailLines = [
      `To: ${user.email}`,
      `Subject: 🧹 Tidy Up: I found ${fileCount} loose files in your Drive`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlBody
    ];

    const email = emailLines.join('\r\n');
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const sendResponse = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encoded,
        },
      });

      console.log(`✨ Janitor Plan Emailed. Waiting for approval.`);
      console.log(`   Message ID: ${sendResponse.data.id}`);
      console.log(`\n📊 Summary:`);
      console.log(`   - Files found: ${fileCount}`);
      console.log(`   - Categories proposed: ${categoryCount}`);
      console.log(`   - Email sent to: ${user.email}`);

    } catch (emailError: any) {
      console.error("❌ Failed to send email:", emailError.message);
      if (emailError.message.includes('insufficient')) {
        console.error("💡 Make sure you've granted Gmail compose permission and re-authenticated.");
      }
    }

  } catch (driveError: any) {
    console.error("❌ Drive scan failed:", driveError.message);
    if (driveError.message.includes('insufficient')) {
      console.error("💡 Make sure you've granted Drive readonly permission and re-authenticated.");
    }
  }
}

runDriveJanitor();

