// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                         INTELLIGENT DOCUMENT ANALYSIS                        ║
// ║                                                                              ║
// ║  The API that creates "holy crap" moments. Not regex. Intelligence.          ║
// ║                                                                              ║
// ║  Input: Documents (PDF, DOCX, emails, etc.)                                  ║
// ║  Output: "You told the board $4.7M but the contract caps at $2.4M"           ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import OpenAI from 'openai';

// Configure API route
export const maxDuration = 120;  // Allow up to 2 minutes for deep analysis
export const dynamic = 'force-dynamic';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// ============================================================================
// THE HOLY CRAP ANALYSIS PROMPT
// ============================================================================

const HOLY_CRAP_SYSTEM_PROMPT = `You are Foldera's Chief Intelligence Officer. Your job is to find the ONE thing in these documents that would make a professional's stomach drop - the conflict, contradiction, or ticking time bomb they don't know about.

You are NOT a document summarizer. You are a paranoid auditor who assumes something is wrong and hunts for it.

WHAT YOU'RE LOOKING FOR:

1. FINANCIAL CONTRADICTIONS
- Amount A says X, Amount B says Y, they should match
- Revenue projections vs contract caps
- Budget in one place, different budget in another
- Payment terms that don't align

2. COMMITMENT CONFLICTS  
- Person promised X to A, but Y to B (contradictory)
- Timeline impossibilities (due Friday but OOO Thu-Fri)
- Exclusive deals that aren't exclusive
- Deliverables that depend on things that won't happen

3. DEADLINE DISASTERS
- Two different dates for the same thing
- Deadline passed with no delivery
- Dependencies that make timelines impossible

4. LEGAL LANDMINES
- Confidentiality vs disclosure conflicts
- Competing exclusivity agreements
- Terms that contradict each other

5. EXPECTATION MISMATCHES
- What you think vs what they think
- Scope creep not captured in amendments
- Verbal vs written disagreements

YOUR OUTPUT:

If you find something critical, output:
{
  "found_conflict": true,
  "severity": "critical|high|medium|low",
  "headline": "One gut-punch sentence. Use specific numbers. Name names. e.g., 'Board sees $4.7M Monday. Contract caps at $2.4M. Gap: $2.3M.'",
  "the_problem": "2-3 sentences explaining what's wrong",
  "evidence": {
    "side_a": {
      "source": "Exact document/email name",
      "quote": "Exact text that says one thing",
      "context": "Where in the document, who said it"
    },
    "side_b": {
      "source": "Exact document/email name", 
      "quote": "Exact text that contradicts",
      "context": "Where in the document, who said it"
    }
  },
  "who_gets_hurt": ["List of people/relationships affected"],
  "if_ignored": "What happens if you do nothing",
  "fix_it_now": {
    "action": "send_email|call|update_doc|escalate|clarify",
    "to": "Who to contact",
    "draft": "Ready-to-send message that resolves this",
    "time_required": "2 minutes|15 minutes|1 hour"
  },
  "urgency": {
    "level": "immediate|today|this_week|eventually",
    "reason": "Why this timeline"
  }
}

If you find multiple conflicts, return the MOST SEVERE ONE. We want one clear action, not a list.

If documents are consistent (no conflicts found), output:
{
  "found_conflict": false,
  "headline": "✓ Documents aligned - no contradictions detected",
  "summary": "Brief summary of what was checked",
  "key_facts": ["Important facts extracted for the knowledge graph"],
  "commitments_detected": [
    {
      "who_promised": "Name",
      "promised_to": "Name", 
      "what": "Description",
      "when_due": "Date or null",
      "confidence": 0.0-1.0
    }
  ],
  "amounts_found": [
    {
      "value": 4700000,
      "raw": "$4.7M",
      "context": "What this number represents",
      "source": "Which document"
    }
  ],
  "reassurance": "A sentence that makes them feel good about the review"
}

CRITICAL RULES:
1. NEVER fabricate quotes - only use exact text from documents
2. NEVER invent conflicts that don't exist
3. If confidence is low, say so
4. Specific > Generic always (use names, numbers, dates)
5. The headline should work as a standalone notification
6. For legal documents, look for contradictory terms, conflicting definitions, or impossible obligations`;

// ============================================================================
// DOCUMENT PARSING UTILITIES
// ============================================================================

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  
  if (file.type === 'application/pdf') {
    try {
      const pdf = (await import('pdf-parse')).default;
      const data = await pdf(Buffer.from(buffer));
      return data.text;
    } catch (error) {
      console.error(`[Intelligent] PDF parsing error:`, error);
      return '';
    }
  } 
  
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      file.type === 'application/msword') {
    try {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return value;
    } catch (error) {
      console.error(`[Intelligent] DOCX parsing error:`, error);
      return '';
    }
  }
  
  if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
    return new TextDecoder().decode(buffer);
  }
  
  // For other files, try as text
  try {
    return new TextDecoder().decode(buffer);
  } catch {
    return '';
  }
}

// ============================================================================
// THE MAIN ANALYSIS ENDPOINT
// ============================================================================

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // Auth check - allow unauthenticated for demo purposes
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email || 'demo@foldera.ai';

    // Parse uploaded files
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`[Intelligent] Processing ${files.length} files for ${userEmail}`);

    // Extract text from all documents
    const documents: { name: string; content: string; type: string }[] = [];
    
    for (const file of files) {
      const content = await extractTextFromFile(file);
      if (content && content.trim().length > 0) {
        documents.push({
          name: file.name,
          content: content.substring(0, 50000), // Limit per doc
          type: file.type,
        });
        console.log(`[Intelligent] Extracted ${content.length} chars from ${file.name}`);
      }
    }

    if (documents.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract text from any documents',
        suggestion: 'Try uploading PDF, DOCX, or TXT files',
      });
    }

    // Build the analysis prompt
    const documentContext = documents.map((doc, i) => 
      `=== DOCUMENT ${i + 1}: ${doc.name} ===\n${doc.content}\n`
    ).join('\n\n');

    const userPrompt = `Analyze these ${documents.length} document(s) for conflicts, contradictions, and critical issues:

${documentContext}

Remember: Find the ONE most critical issue. Be specific. Use exact quotes. Make the headline hit hard.`;

    // Call OpenAI GPT-4o for intelligent analysis
    console.log(`[Intelligent] Calling OpenAI GPT-4o for analysis...`);
    
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: HOLY_CRAP_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
    });

    const responseText = response.choices[0].message.content || '';
    
    // Parse the JSON response
    let analysis;
    try {
      const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('[Intelligent] Failed to parse Claude response:', responseText);
      // Return a fallback
      analysis = {
        found_conflict: false,
        headline: 'Analysis complete - review results',
        summary: responseText.substring(0, 500),
        key_facts: [],
        commitments_detected: [],
        amounts_found: [],
        reassurance: 'Documents processed successfully',
      };
    }

    const processingTime = Date.now() - startTime;
    console.log(`[Intelligent] Analysis complete in ${processingTime}ms`);

    // Transform to the format expected by the frontend
    const result = {
      success: true,
      processingTimeMs: processingTime,
      documentsAnalyzed: documents.length,
      totalWords: documents.reduce((sum, d) => sum + d.content.split(/\s+/).length, 0),
      
      // The holy crap moment (if found)
      foundConflict: analysis.found_conflict,
      severity: analysis.severity || null,
      
      // Main output
      headline: analysis.headline,
      problem: analysis.the_problem || null,
      
      // Evidence
      evidence: analysis.evidence ? {
        sideA: {
          source: analysis.evidence.side_a?.source,
          quote: analysis.evidence.side_a?.quote,
          context: analysis.evidence.side_a?.context,
        },
        sideB: {
          source: analysis.evidence.side_b?.source,
          quote: analysis.evidence.side_b?.quote,
          context: analysis.evidence.side_b?.context,
        },
      } : null,
      
      // Impact
      whoGetsHurt: analysis.who_gets_hurt || [],
      ifIgnored: analysis.if_ignored || null,
      
      // Solution
      solution: analysis.fix_it_now ? {
        action: analysis.fix_it_now.action,
        to: analysis.fix_it_now.to,
        draft: analysis.fix_it_now.draft,
        timeRequired: analysis.fix_it_now.time_required,
      } : null,
      
      // Urgency
      urgency: analysis.urgency || null,
      
      // If no conflict, still useful data
      summary: analysis.summary || null,
      keyFacts: analysis.key_facts || [],
      commitmentsDetected: analysis.commitments_detected || [],
      amountsFound: analysis.amounts_found || [],
      reassurance: analysis.reassurance || null,
      
      // Metadata
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[Intelligent] Analysis error:', error);
    return NextResponse.json({
      success: false,
      error: 'Analysis failed',
      details: error.message,
    }, { status: 500 });
  }
}

