// =====================================================
// FOLDERA CONTRADICTION ENGINE
// Phase 3: The "Landmine Detectors"
// Scans Gmail drafts against contracts to detect contradictions
// =====================================================

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { google } from 'googleapis';
import { extractBody, getHeader } from '../lib/plugins/gmail/scanner';

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

interface DraftEmail {
  id: string;
  subject: string;
  body: string;
  to?: string;
  threadId?: string;
}

interface ContractFile {
  id: string;
  name: string;
  content: string; // Text content or excerpt
  mimeType: string;
  webViewLink?: string;
}

async function runContradictionScan() {
  console.log("🔍 Foldera 3.0: The Contradiction Engine");
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

  // 2. Initialize Google API clients
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: new Date(user.google_token_expires_at).getTime(),
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // STEP A: Fetch Last 5 DRAFT Emails
    console.log("\n📧 STEP A: Fetching Gmail drafts...");
    
    const draftsResponse = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: 5,
      q: 'is:draft', // Only fetch drafts
    });

    const draftIds = draftsResponse.data.drafts?.map(d => d.id!) || [];

    if (draftIds.length === 0) {
      console.log("✅ No drafts found. Nothing to scan.");
      return;
    }

    console.log(`📋 Found ${draftIds.length} draft(s)`);

    const drafts: DraftEmail[] = [];

    // Fetch full draft details
    for (const draftId of draftIds) {
      try {
        const draftResponse = await gmail.users.drafts.get({
          userId: 'me',
          id: draftId,
          format: 'full',
        });

        const message = draftResponse.data.message;
        if (!message || !message.id) continue;

        // Extract subject
        const subject = getHeader(message.payload?.headers, 'Subject') || '(No Subject)';
        
        // Extract body
        const bodyData = extractBody(message.payload);
        const body = bodyData.text || bodyData.html || '';

        // Extract to
        const to = getHeader(message.payload?.headers, 'To') || '';

        drafts.push({
          id: message.id!,
          subject,
          body,
          to,
          threadId: message.threadId || undefined,
        });
      } catch (draftError: any) {
        console.error(`⚠️ Error fetching draft ${draftId}:`, draftError.message);
        continue;
      }
    }

    if (drafts.length === 0) {
      console.log("⚠️ No valid drafts found after processing.");
      return;
    }

    console.log(`✅ Processed ${drafts.length} draft(s)`);

    // STEP B: Fetch Contracts from Google Drive
    console.log("\n📁 STEP B: Fetching contracts from Google Drive...");

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Search for contract files by name pattern
    const contractQuery = `modifiedTime > '${thirtyDaysAgoISO}' and (name contains 'MSA' or name contains 'Contract' or name contains 'Agreement' or name contains 'SOW') and trashed=false`;
    
    const driveResponse = await drive.files.list({
      q: contractQuery,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 20, // Limit to 20 most recent contracts
    });

    const contractFiles = driveResponse.data.files || [];

    if (contractFiles.length === 0) {
      console.log("⚠️ No contract files found in the last 30 days.");
      console.log("💡 The system will still analyze drafts, but without contract context.");
    } else {
      console.log(`📋 Found ${contractFiles.length} contract file(s)`);
    }

    // Fetch contract content
    const contracts: ContractFile[] = [];

    for (const file of contractFiles.slice(0, 10)) { // Limit to 10 contracts for analysis
      try {
        let content = '';
        
        // Try to extract text content based on file type
        if (file.mimeType === 'application/vnd.google-apps.document') {
          // Google Doc - export as plain text
          const exportResponse = await drive.files.export({
            fileId: file.id!,
            mimeType: 'text/plain',
          });
          content = (exportResponse.data as string).substring(0, 5000); // Limit to 5000 chars
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          // Google Sheet - export as CSV
          try {
            const exportResponse = await drive.files.export({
              fileId: file.id!,
              mimeType: 'text/csv',
            });
            content = (exportResponse.data as string).substring(0, 2000);
          } catch {
            content = `[Spreadsheet: ${file.name}]`;
          }
        } else if (file.mimeType?.includes('pdf')) {
          // PDF - can't easily extract text without special library, use metadata
          content = `[PDF Contract: ${file.name}]`;
        } else if (file.mimeType?.includes('wordprocessingml') || file.mimeType?.includes('document')) {
          // Word doc - metadata only for now
          content = `[Word Document: ${file.name}]`;
        } else {
          // Other types - metadata only
          content = `[Document: ${file.name}]`;
        }

        contracts.push({
          id: file.id!,
          name: file.name || 'Untitled',
          content,
          mimeType: file.mimeType || 'unknown',
          webViewLink: file.webViewLink || undefined,
        });
      } catch (contractError: any) {
        console.error(`⚠️ Error fetching contract ${file.name}:`, contractError.message);
        // Still add it with metadata only
        contracts.push({
          id: file.id!,
          name: file.name || 'Untitled',
          content: `[Contract: ${file.name}]`,
          mimeType: file.mimeType || 'unknown',
          webViewLink: file.webViewLink || undefined,
        });
      }
    }

    console.log(`✅ Processed ${contracts.length} contract(s)`);

    // STEP C: The Brain - AI Analysis
    console.log("\n🤖 STEP C: Analyzing drafts against contracts...");

    // Format drafts for AI
    const draftsText = drafts.map((d, i) => 
      `DRAFT ${i + 1}:
Subject: ${d.subject}
To: ${d.to || 'N/A'}
Body: ${d.body.substring(0, 1000)}${d.body.length > 1000 ? '...' : ''}
`
    ).join('\n---\n\n');

    // Format contracts for AI
    const contractsText = contracts.length > 0
      ? contracts.map((c, i) =>
          `CONTRACT ${i + 1}:
Name: ${c.name}
Type: ${c.mimeType}
Content: ${c.content.substring(0, 3000)}${c.content.length > 3000 ? '...' : ''}
`
        ).join('\n---\n\n')
      : '[No contracts found in the last 30 days]';

    // Call OpenAI for risk analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a Legal Risk Guardrail.

Compare these EMAIL DRAFTS against these CONTRACT FILES.

Look for FACTUAL CONTRADICTIONS (e.g., Payment Terms, Deadlines, Deliverables).

Example:
Draft: 'I can pay you in 60 days.'
Contract: 'Payment due Net-30.'
Result: CONTRADICTION DETECTED.

Return JSON only (no markdown):
{
  "risks": [
    {
      "draft_subject": "Subject of the draft email",
      "draft_index": 0,
      "explanation": "Detailed explanation of the contradiction",
      "severity": "high",
      "contract_name": "Name of the contract file (if applicable)",
      "draft_excerpt": "Relevant excerpt from draft",
      "contract_excerpt": "Relevant excerpt from contract"
    }
  ]
}

Severity levels:
- "high": Direct contradiction that could cause legal/financial issues
- "medium": Potential contradiction or unclear alignment
- "low": Minor concern or suggestion

Only report real contradictions. If no contradictions found, return: { "risks": [] }`
        },
        {
          role: 'user',
          content: `EMAIL DRAFTS:\n\n${draftsText}\n\n=== CONTRACTS ===\n\n${contractsText}`
        }
      ],
      temperature: 0.3, // Lower temperature for more factual analysis
      max_tokens: 2000,
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

    const riskAnalysis = JSON.parse(jsonText);
    const risks = riskAnalysis.risks || [];

    console.log(`✅ Analysis complete. Found ${risks.length} risk(s)`);

    if (risks.length === 0) {
      console.log("✨ No contradictions detected. Your drafts are clean!");
      return;
    }

    // Store risks in database
    console.log("\n💾 Storing risks in database...");

    const highSeverityRisks: any[] = [];
    
    for (const risk of risks) {
      const draftIndex = risk.draft_index || 0;
      const draft = drafts[draftIndex];

      if (!draft) continue;

      // Insert risk alert
      const { data: alert, error: dbError } = await supabase
        .from('risk_alerts')
        .insert({
          user_id: user.id,
          source_id: draft.id,
          source_type: 'gmail_draft',
          risk_type: 'contradiction',
          severity: risk.severity || 'medium',
          description: risk.explanation || 'Contradiction detected',
          draft_subject: risk.draft_subject || draft.subject,
          draft_excerpt: risk.draft_excerpt || draft.body.substring(0, 500),
          contract_name: risk.contract_name || null,
          contract_excerpt: risk.contract_excerpt || null,
          status: 'new',
        })
        .select()
        .single();

      if (dbError) {
        console.error(`⚠️ Failed to store risk for draft "${draft.subject}":`, dbError.message);
      } else {
        console.log(`✅ Stored risk: ${risk.severity.toUpperCase()} - ${risk.draft_subject || draft.subject}`);
        
        if (risk.severity === 'high') {
          highSeverityRisks.push({
            alert,
            risk,
            draft,
          });
        }
      }
    }

    // STEP D: Send Warning Email for High Severity Risks
    if (highSeverityRisks.length > 0) {
      console.log("\n⚠️ STEP D: Sending warning email for HIGH severity risks...");

      for (const { alert, risk, draft } of highSeverityRisks) {
        try {
          // Create draft link (Gmail draft URL)
          const draftLink = `https://mail.google.com/mail/u/0/#drafts/${draft.id}`;
          
          // Create contract link if available
          const contract = contracts.find(c => c.name === risk.contract_name);
          const contractLink = contract?.webViewLink || 'N/A';

          const warningBody = `⚠️ STOP: Risk detected in draft '${draft.subject}'

You are about to promise something that contradicts your contract.

RISK DETAILS:
${risk.explanation}

DRAFT:
${risk.draft_excerpt || draft.body.substring(0, 300)}

CONTRACT:
${risk.contract_excerpt || 'See contract file for details'}

LINKS:
📧 Draft: ${draftLink}
📄 Contract: ${contractLink}

Please review before sending.`;

          // Create Gmail draft warning email
          const emailLines = [
            `To: ${user.email}`,
            `Subject: ⚠️ STOP: Risk detected in draft '${draft.subject}'`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Transfer-Encoding: 7bit`,
            '',
            warningBody
          ];

          const email = emailLines.join('\r\n');
          const encoded = Buffer.from(email)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const draftResponse = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
              message: {
                raw: encoded,
              },
            },
          });

          console.log(`✅ Warning draft created: ${draftResponse.data.id}`);
        } catch (emailError: any) {
          console.error(`❌ Failed to create warning email:`, emailError.message);
        }
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   - Drafts scanned: ${drafts.length}`);
    console.log(`   - Contracts analyzed: ${contracts.length}`);
    console.log(`   - Risks detected: ${risks.length}`);
    console.log(`   - High severity: ${highSeverityRisks.length}`);

  } catch (error: any) {
    console.error("❌ Contradiction scan failed:", error.message);
    if (error.message.includes('insufficient')) {
      console.error("💡 Make sure you've granted Gmail and Drive permissions and re-authenticated.");
    }
  }
}

runContradictionScan();

