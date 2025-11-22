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

    // Format files for AI (Name, ID, MimeType)
    const filesForAI = filesList.map((f) => ({
      file: f.file_name,
      id: f.id,
      mimeType: f.mime_type,
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert File Clerk. Review these loose files. Suggest a folder structure. Group them by project or topic.

Return JSON:
{
  "plan": [
    { "file": "invoice_2024.pdf", "move_to": "Finance/Invoices" },
    ...
  ]
}`
        },
        {
          role: 'user',
          content: `Here are the loose files in the root directory:\n\n${JSON.stringify(filesForAI, null, 2)}`
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

    console.log(`✅ Plan generated: ${janitorPlan.plan?.length || 0} file moves proposed`);

    const fileCount = files.length;
    const aiMoves = janitorPlan.plan || [];

    // Match AI plan back to actual file IDs for accurate execution
    const moves = aiMoves.map((move: any) => {
      const matchedFile = filesList.find((f) => f.file_name === move.file);
      return {
        file: move.file,
        file_id: matchedFile?.id || null, // Store file ID for accurate matching
        move_to: move.move_to,
      };
    }).filter((move: any) => move.file_id !== null); // Only include files we can find

    // 4. SAVE TO DATABASE: Insert pending action
    console.log("\n💾 Saving plan to database...");
    
    const { data: pendingAction, error: dbError } = await supabase
      .from('pending_actions')
      .insert({
        user_id: user.id,
        type: 'drive_cleanup',
        data: {
          file_moves: moves,
          file_count: fileCount,
          created_at: new Date().toISOString(),
        },
        status: 'pending',
      })
      .select()
      .single();

    if (dbError || !pendingAction) {
      console.error("❌ Failed to save plan to database:", dbError);
      throw new Error(`Database error: ${dbError?.message || 'Unknown error'}`);
    }

    console.log(`✅ Plan saved with ID: ${pendingAction.id}`);

    // 5. THE APPROVER: Construct Email Draft with execution link
    console.log("\n📧 THE APPROVER: Constructing email draft...");

    // Build list of moves
    const movesList = moves.map((move: any) => 
      `  • ${move.file} → ${move.move_to}`
    ).join('\n');

    // Create execution link
    const executionUrl = `https://www.foldera.ai/janitor/execute/${pendingAction.id}`;

    const plainTextBody = `I can organize your drive. Here is the plan:

${movesList}

📋 Click here to execute this cleanup:
${executionUrl}

(This is a draft. Click the link above to approve and execute the file moves.)`;

    // 6. EXECUTION: Create Gmail Draft
    console.log("\n📬 Creating Gmail draft...");

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build email message
    const emailLines = [
      `To: ${user.email}`,
      `Subject: 🧹 Tidy Up: I found ${fileCount} loose files`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      plainTextBody
    ];

    const email = emailLines.join('\r\n');
    const encoded = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const draftResponse = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: encoded,
          },
        },
      });

      console.log(`✨ Janitor Proposal Drafted`);
      console.log(`   Draft ID: ${draftResponse.data.id}`);
      console.log(`   Pending Action ID: ${pendingAction.id}`);
      console.log(`   Execution URL: ${executionUrl}`);
      console.log(`\n📊 Summary:`);
      console.log(`   - Files found: ${fileCount}`);
      console.log(`   - Moves proposed: ${moves.length}`);
      console.log(`   - Draft created for: ${user.email}`);

    } catch (draftError: any) {
      console.error("❌ Failed to create draft:", draftError.message);
      if (draftError.message.includes('insufficient')) {
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

