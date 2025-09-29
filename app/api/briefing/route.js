import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import MsgReader from 'msgreader';

// Initialize Supabase client
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// File processors (reused from upload route)
async function processPdf(buffer) {
  const pdf = (await import('pdf-parse')).default;
  const data = await pdf(buffer);
  return data.text;
}

async function processDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function processMsg(buffer) {
  const msg = new MsgReader(buffer);
  const data = msg.getFileData();
  const body = data.body || '';
  return `${data.subject}\n\n${body}`;
}

async function processZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let allText = '';
  for (const filename in zip.files) {
    if (!zip.files[filename].dir) {
      const fileBuffer = await zip.files[filename].async('nodebuffer');
      const text = await extractTextFromBuffer(fileBuffer, filename);
      allText += `\n\n--- ${filename} ---\n${text}`;
    }
  }
  return allText;
}

async function extractTextFromBuffer(buffer, fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  switch (extension) {
    case 'pdf': return await processPdf(buffer);
    case 'docx': return await processDocx(buffer);
    case 'msg': return await processMsg(buffer);
    case 'zip': return await processZip(buffer);
    case 'txt': return buffer.toString('utf-8');
    default: return '';
  }
}

async function callClaudeAPI(documents) {
  const prompt = `You are Foldera's Insight Engine. Analyze these documents and create an Executive Briefing.

Answer these 3 questions in clear, actionable language:
1. WHAT CHANGED: What new information or updates are in these documents?
2. WHAT MATTERS: What's the single highest-priority issue, conflict, or opportunity?
3. WHAT TO DO NEXT: What specific action should they take right now?

Keep it under 200 words total. Be direct and decisive.

DOCUMENTS TO ANALYZE:
${documents}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    
    // Parse the response into structured format
    const lines = content.split('\n').filter(line => line.trim());
    let whatChanged = '';
    let whatMatters = '';
    let whatToDoNext = '';
    
    let currentSection = '';
    for (const line of lines) {
      if (line.includes('WHAT CHANGED')) {
        currentSection = 'changed';
        whatChanged = line.replace(/^\d*\.?\s*WHAT CHANGED:?\s*/i, '').trim();
      } else if (line.includes('WHAT MATTERS')) {
        currentSection = 'matters';
        whatMatters = line.replace(/^\d*\.?\s*WHAT MATTERS:?\s*/i, '').trim();
      } else if (line.includes('WHAT TO DO NEXT')) {
        currentSection = 'next';
        whatToDoNext = line.replace(/^\d*\.?\s*WHAT TO DO NEXT:?\s*/i, '').trim();
      } else if (currentSection && line.trim()) {
        // Continue adding to current section
        const current = currentSection === 'changed' ? whatChanged : 
                       currentSection === 'matters' ? whatMatters : whatToDoNext;
        if (current) {
          if (currentSection === 'changed') whatChanged += ' ' + line.trim();
          else if (currentSection === 'matters') whatMatters += ' ' + line.trim();
          else if (currentSection === 'next') whatToDoNext += ' ' + line.trim();
        }
      }
    }

    return {
      whatChanged: whatChanged || 'Document analysis completed.',
      whatMatters: whatMatters || 'Review the uploaded materials for key insights.',
      whatToDoNext: whatToDoNext || 'Consider next steps based on document contents.'
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      whatChanged: 'Unable to analyze documents at this time.',
      whatMatters: 'Please review the uploaded files manually.',
      whatToDoNext: 'Try uploading again or contact support if issues persist.'
    };
  }
}

export async function POST(request) {
  try {
    let requestBody = {};
    try {
      const text = await request.text();
      console.log('Raw request body:', text);
      if (text.trim()) {
        requestBody = JSON.parse(text);
      }
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      // Return demo response instead of error for better UX
      return NextResponse.json({ 
        whatChanged: 'Demo mode: Documents would be analyzed here.',
        whatMatters: 'This is a preview of the briefing engine.',
        whatToDoNext: 'Configure Supabase to enable full document analysis.'
      });
    }
    
    const { projectId, caseId, userId } = requestBody;
    const identifier = projectId || caseId || 'demo';

    if (!identifier) {
      return NextResponse.json({ error: 'Project ID or Case ID is required.' }, { status: 400 });
    }

    // Check usage limits if userId provided
    if (userId) {
      try {
        const usageResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/billing/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action: 'get' })
        });

        if (usageResponse.ok) {
          const usage = await usageResponse.json();
          if (!usage.canUpload) {
            return NextResponse.json({
              whatChanged: `You've reached your monthly limit (${usage.current}/${usage.limit} documents)`,
              whatMatters: 'Your briefing engine is working but needs more capacity',
              whatToDoNext: 'Upgrade to Pro for unlimited analysis and advanced features',
              upgradeRequired: true,
              plan: usage.planName,
              current: usage.current,
              limit: usage.limit,
              upgradeUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/pricing`
            });
          }

          // Record this usage
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/billing/usage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action: 'record', count: 1 })
          });

          // Send activation email for first-time free users
          if (usage.planName === 'Free' && usage.current === 1) {
            try {
              // Get user's email (would need to fetch from database in production)
              const userEmail = 'demo@example.com'; // Replace with actual email lookup

              await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/send-activation-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: userEmail,
                  userName: 'Demo User', // Replace with actual name
                  insights: ['First briefing completed successfully'],
                  upgradeUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/pricing`
                })
              });
            } catch (emailError) {
              console.error('Activation email error:', emailError);
              // Continue - email failure shouldn't block the briefing
            }
          }
        }
      } catch (usageError) {
        console.error('Usage check error:', usageError);
        // Continue if usage check fails
      }
    }

    if (!supabase) {
      return NextResponse.json({ 
        whatChanged: 'Demo mode: Documents would be analyzed here.',
        whatMatters: 'This is a preview of the briefing engine.',
        whatToDoNext: 'Configure Supabase to enable full document analysis.'
      });
    }

    // Get all files from Supabase storage for this project
    const { data: files, error } = await supabase.storage
      .from('case-files')
      .list(identifier);

    if (error || !files || files.length === 0) {
      return NextResponse.json({ 
        whatChanged: 'No documents found for this project.',
        whatMatters: 'Upload some documents to get started.',
        whatToDoNext: 'Use the file upload feature to add your documents.'
      });
    }

    // Process each file and extract text
    let allDocuments = '';
    for (const file of files) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('case-files')
        .download(`${identifier}/${file.name}`);

      if (!downloadError && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const text = await extractTextFromBuffer(buffer, file.name);
        if (text.trim()) {
          allDocuments += `\n\n=== ${file.name} ===\n${text}`;
        }
      }
    }

    if (!allDocuments.trim()) {
      return NextResponse.json({ 
        whatChanged: 'No readable text found in uploaded documents.',
        whatMatters: 'Check that your files contain text content.',
        whatToDoNext: 'Try uploading PDF, DOCX, or text files.'
      });
    }

    // Call Claude API for analysis
    const briefing = await callClaudeAPI(allDocuments);
    return NextResponse.json(briefing);

  } catch (error) {
    console.error('Error in briefing API:', error);
    return NextResponse.json({ 
      whatChanged: 'Error occurred during analysis.',
      whatMatters: 'Please try again.',
      whatToDoNext: 'Contact support if the issue persists.'
    }, { status: 500 });
  }
}
