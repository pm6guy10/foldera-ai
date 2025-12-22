// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    INTELLIGENT COMMITMENT EXTRACTOR                          ║
// ║                                                                              ║
// ║  The difference between "regex found 'deadline'" and "Brandon promised       ║
// ║  Sarah the deck by Friday, and she's presenting to the board Monday."        ║
// ║                                                                              ║
// ║  This is the core intelligence that creates "holy crap" moments.             ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import OpenAI from 'openai';

// ============================================================================
// TYPES (self-contained to avoid circular dependencies)
// ============================================================================

export type CommitmentCategory = 
  | 'deliver_document'
  | 'deliver_artifact'
  | 'schedule_meeting'
  | 'provide_information'
  | 'make_decision'
  | 'make_introduction'
  | 'follow_up'
  | 'review_approve'
  | 'payment_financial'
  | 'attend_participate'
  | 'other';

export type SignalSource = 
  | 'gmail' 
  | 'outlook' 
  | 'google_calendar' 
  | 'outlook_calendar'
  | 'slack'
  | 'notion'
  | 'drive'
  | 'dropbox'
  | 'uploaded_document'
  | 'manual_entry';

export type SignalType = 
  | 'email_sent'
  | 'email_received'
  | 'calendar_event'
  | 'calendar_invite'
  | 'slack_message'
  | 'document_created'
  | 'document_modified'
  | 'document_shared'
  | 'task_created'
  | 'task_completed';

export interface Entity {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  role: string | null;
  company: string | null;
}

export interface Signal {
  id: string;
  source: SignalSource;
  type: SignalType;
  author: string;
  recipients: string[];
  content: string;
  occurredAt: Date;
  extractedAmounts: any[];
  extractedDates: any[];
}

export interface Commitment {
  id: string;
  promisor: Entity;
  promisee: Entity;
  description: string;
  dueAt: Date | null;
  impliedDueAt: Date | null;
  resolution?: {
    outcome: 'fulfilled_on_time' | 'fulfilled_late' | 'broken' | 'cancelled';
    resolvedAt: Date;
  } | null;
}

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
// THE EXTRACTION PROMPTS
// ============================================================================

const COMMITMENT_EXTRACTION_SYSTEM = `You are Foldera's Commitment Intelligence Engine.

Your job is to find PROMISES in business communications - not just keywords, but actual commitments where someone is creating an expectation that they will do something.

A COMMITMENT is when someone says they will do something for someone else. The key elements are:
1. WHO is promising (the promisor)
2. WHO is expecting delivery (the promisee) 
3. WHAT is promised (the deliverable)
4. WHEN it's due (explicit or implied)
5. WHY it matters (the stakes)

WHAT IS A COMMITMENT:
✓ "I'll send you the deck by Friday" - explicit commitment with deadline
✓ "Let me get back to you on that" - implicit commitment to respond
✓ "I'll loop in Sarah" - commitment to make an introduction
✓ "Will do" - acknowledgment that creates expectation
✓ "I'll have the numbers for you" - commitment to provide information
✓ "Let me check and circle back" - commitment to follow up

WHAT IS NOT A COMMITMENT:
✗ "Let me know if you need anything" - offer, not promise
✗ "I think we should..." - suggestion, not commitment
✗ "Thanks for sending!" - acknowledgment, not commitment
✗ "Sounds good" - agreement, not deliverable commitment
✗ "We could try..." - hypothetical, not commitment
✗ Calendar invites from the person themselves - not a commitment TO someone
✗ Automated messages, newsletters, notifications

CRITICAL DISTINCTIONS:
- "I'll try to get it to you" IS a commitment (hedged, but still creates expectation)
- "If I have time I'll look at it" is NOT a commitment (conditional)
- "Let's sync next week" IS a commitment if it implies one person will schedule
- Multiple "I'll..." statements = multiple commitments (extract each separately)

For each commitment, you MUST extract:
1. description: What exactly was promised (be specific)
2. category: One of the categories below
3. promisor_email: Email of the person who made the promise
4. promisee_email: Email of the person expecting delivery
5. explicit_deadline: If a specific date/time was mentioned (ISO format or null)
6. implied_deadline_reason: Why you think there's an implied deadline (or null)
7. stakes: What happens if this isn't delivered? Who's affected?
8. confidence: 0.0-1.0 how confident you are this is a real commitment
9. context: The surrounding text that gives meaning to this commitment

CATEGORIES:
- deliver_document: Sending a file, deck, report, proposal
- deliver_artifact: Shipping code, feature, design, product
- schedule_meeting: Setting up a call, meeting, sync
- provide_information: Getting back with numbers, answers, data
- make_decision: Deciding on something by a deadline
- make_introduction: Connecting two people
- follow_up: Circle back, touch base, check in
- review_approve: Review and sign off, approve something
- payment_financial: Payment, invoice, funding
- attend_participate: Will be there, will join, will attend
- other: Anything else

OUTPUT FORMAT:
{
  "commitments": [
    {
      "description": "Send the Q4 revenue projections deck",
      "category": "deliver_document",
      "promisor_email": "brandon@company.com",
      "promisee_email": "sarah@investor.com",
      "explicit_deadline": "2025-01-03T17:00:00Z",
      "implied_deadline_reason": null,
      "stakes": "Sarah needs this for her board presentation Monday",
      "confidence": 0.95,
      "context": "I'll have the Q4 revenue projections to you by Friday 5pm - I know you need it for the board meeting Monday."
    }
  ],
  "amounts": [
    {
      "raw": "$4.7M",
      "normalized": 4700000,
      "currency": "USD",
      "context": "projected revenue of $4.7M",
      "type": "revenue",
      "confidence": 0.9
    }
  ],
  "dates": [
    {
      "raw": "Friday 5pm",
      "normalized": "2025-01-03T17:00:00Z",
      "type": "deadline",
      "context": "by Friday 5pm",
      "confidence": 0.95
    }
  ],
  "entities_mentioned": ["sarah@investor.com", "board"]
}

If no commitments found, return: {"commitments": [], "amounts": [], "dates": [], "entities_mentioned": []}

Be thorough but precise. False positives waste time. False negatives miss "holy crap" moments.`;

const CONFLICT_DETECTION_SYSTEM = `You are Foldera's Conflict Detection Engine.

Your job is to find CONTRADICTIONS and IMPOSSIBILITIES across multiple pieces of information.

A CONFLICT is when reality doesn't add up:
- Two commitments that can't both be true
- A commitment that's physically impossible given calendar
- Numbers that should match but don't
- Deadlines that contradict each other
- Expectations that can't all be met

CONFLICT TYPES:

1. COMMITMENT VS COMMITMENT
"You told A you'd do X exclusively, but told B you'd do X for them too"
"You promised the deck to both Sarah and Mike, but it's different versions"

2. COMMITMENT VS CALENDAR  
"You promised to deliver Friday, but you're OOO Thursday-Friday"
"You have 3 decks due Friday and only 8 hours of meetings-free time"

3. AMOUNT MISMATCH
"Email says revenue is $4.7M, but the contract caps at $2.4M"
"Budget document says $50K, proposal says $75K"

4. DATE MISMATCH
"Contract says delivery Jan 15, email says Jan 30"
"You told them next Friday but your calendar says you meant this Friday"

5. TERM CONTRADICTION
"Document A says exclusive partnership, Document B says non-exclusive"
"Email says fixed price, contract says hourly"

6. EXPECTATION MISMATCH
"They think it's a firm commitment, you think it's a maybe"
"They're expecting a full report, you're planning a one-pager"

7. GHOSTING
"You promised to respond 3 days ago and haven't"
"They're waiting for the deck you promised last week"

8. OVERCOMMITMENT
"You have 5 deliverables due in 48 hours - physically impossible"
"You're in back-to-back meetings but promised 'deep work' this week"

For each conflict, provide:
1. type: One of the types above
2. severity: critical/high/medium/low
3. headline: One terrifying sentence (make it visceral)
4. narrative: Full explanation with evidence
5. who_is_affected: List of people impacted
6. what_happens_if_ignored: Consequences of inaction
7. suggested_resolution: What to do right now
8. urgency: immediate/today/this_week/eventually

SEVERITY GUIDE:
- CRITICAL: Will definitely cause harm if not addressed in 24h (broken promise to important person, major financial discrepancy, legal issue)
- HIGH: Will likely cause harm this week (at-risk deadline, expectation mismatch with stakeholder)
- MEDIUM: Should be addressed soon (minor discrepancy, low-stakes ghosting)
- LOW: Worth noting but not urgent (style inconsistency, minor date confusion)

OUTPUT FORMAT:
{
  "conflicts": [
    {
      "type": "amount_mismatch",
      "severity": "critical",
      "headline": "You're presenting $4.7M revenue to the board, but the contract caps at $2.4M",
      "narrative": "In your email to Sarah (Dec 20), you mentioned 'projected revenue of $4.7M'. However, the signed Master Services Agreement (Dec 1) explicitly states 'total contract value not to exceed $2.4M'. This is a $2.3M gap (48%) that will surface when the board reviews the numbers against the contract.",
      "evidence": [
        {"source": "Email to Sarah", "date": "2024-12-20", "quote": "projected revenue of $4.7M"},
        {"source": "MSA Section 4.2", "date": "2024-12-01", "quote": "not to exceed $2.4M"}
      ],
      "who_is_affected": ["Sarah Chen (Board)", "CFO", "Your credibility"],
      "what_happens_if_ignored": "Board discovers discrepancy during meeting, questions all your projections, damages trust",
      "suggested_resolution": "Email Sarah NOW explaining the gap: contract covers Y1 only, $4.7M is Y1+Y2 projection, or correct the deck before Monday",
      "urgency": "immediate"
    }
  ]
}

Be paranoid. Better to flag something that turns out fine than miss something that explodes.`;

// ============================================================================
// THE EXTRACTOR CLASS
// ============================================================================

export class IntelligentExtractor {
  /**
   * Extract commitments from a signal (email, message, document).
   */
  static async extractFromSignal(
    signal: Signal,
    knownEntities: Entity[],
    userEmail: string
  ): Promise<ExtractionResult> {
    
    // Build context about known entities
    const entityContext = knownEntities.map(e => 
      `${e.displayName} <${e.primaryEmail}> - ${e.role || 'unknown role'} at ${e.company || 'unknown company'}`
    ).join('\n');

    const prompt = `SIGNAL TO ANALYZE:
Source: ${signal.source}
Type: ${signal.type}
Author: ${signal.author}
Recipients: ${signal.recipients.join(', ')}
Date: ${signal.occurredAt.toISOString()}
Content:
---
${signal.content}
---

KNOWN ENTITIES (for reference):
${entityContext}

USER EMAIL (to determine direction of commitments): ${userEmail}

Extract all commitments, amounts, dates, and entities from this signal.`;

    try {
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: 'gpt-4o', // Latest GPT-4 Omni model
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: COMMITMENT_EXTRACTION_SYSTEM },
          { role: 'user', content: prompt }
        ],
      });

      const text = response.choices[0].message.content || '';
      
      // Parse JSON response
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        commitments: result.commitments || [],
        amounts: result.amounts || [],
        dates: result.dates || [],
        entitiesMentioned: result.entities_mentioned || [],
        tokensUsed: (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0),
      };

    } catch (error) {
      console.error('[IntelligentExtractor] Extraction failed:', error);
      return {
        commitments: [],
        amounts: [],
        dates: [],
        entitiesMentioned: [],
        tokensUsed: 0,
      };
    }
  }

  /**
   * Detect conflicts across multiple signals and commitments.
   */
  static async detectConflicts(
    newSignal: Signal,
    recentSignals: Signal[],
    activeCommitments: Commitment[],
    userEmail: string
  ): Promise<ConflictDetectionResult> {
    
    // Build context of existing commitments
    const commitmentContext = activeCommitments.map(c => 
      `[${c.id}] ${c.promisor.displayName} → ${c.promisee.displayName}: "${c.description}" (due: ${c.dueAt?.toISOString() || c.impliedDueAt?.toISOString() || 'unspecified'})`
    ).join('\n');

    // Build context of recent signals with amounts
    const signalContext = recentSignals
      .filter(s => s.extractedAmounts.length > 0 || s.extractedDates.length > 0)
      .map(s => {
        const amounts = s.extractedAmounts.map(a => `${a.raw} (${a.type})`).join(', ');
        const dates = s.extractedDates.map(d => `${d.raw} → ${d.normalized}`).join(', ');
        return `[${s.source}] ${s.occurredAt.toISOString()}: ${s.content.substring(0, 200)}...\n  Amounts: ${amounts || 'none'}\n  Dates: ${dates || 'none'}`;
      })
      .join('\n\n');

    const prompt = `NEW SIGNAL TO CHECK:
Source: ${newSignal.source}
Date: ${newSignal.occurredAt.toISOString()}
Content:
---
${newSignal.content}
---

ACTIVE COMMITMENTS (check for conflicts):
${commitmentContext || 'None yet'}

RECENT SIGNALS WITH FINANCIAL/DATE DATA (check for contradictions):
${signalContext || 'None'}

USER EMAIL: ${userEmail}

Analyze this new signal against existing commitments and recent signals. Find any conflicts, contradictions, or impossibilities.`;

    try {
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CONFLICT_DETECTION_SYSTEM },
          { role: 'user', content: prompt }
        ],
      });

      const text = response.choices[0].message.content || '';
      
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        conflicts: result.conflicts || [],
        tokensUsed: (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0),
      };

    } catch (error) {
      console.error('[IntelligentExtractor] Conflict detection failed:', error);
      return {
        conflicts: [],
        tokensUsed: 0,
      };
    }
  }

  /**
   * Generate a "holy crap" headline for a conflict.
   * This is what users see first - it needs to hit hard.
   */
  static async generateHolyCrapHeadline(
    conflict: DetectedConflict,
    userContext: UserContext
  ): Promise<string> {
    
    const prompt = `Generate a single, punchy headline for this business conflict that will make the user's stomach drop (in a good way - they're glad they caught it).

CONFLICT:
Type: ${conflict.type}
Severity: ${conflict.severity}
Current headline: ${conflict.headline}
Narrative: ${conflict.narrative}

USER CONTEXT:
Name: ${userContext.name}
Role: ${userContext.role}
Key relationships: ${userContext.keyRelationships.join(', ')}

RULES:
- Maximum 15 words
- Use specific numbers if available
- Name people if relevant (makes it real)
- Focus on the CONSEQUENCE, not just the facts
- Make it visceral but professional

Good examples:
- "Sarah's board meets Monday. Your deck says $4.7M. The contract caps at $2.4M."
- "You promised Mike the report Friday. Your calendar says you're in Cabo Thu-Sat."
- "3 deliverables due in 48 hours. 6 hours of available work time. Something breaks."

Bad examples:
- "Potential discrepancy detected in financial projections" (boring, no stakes)
- "Warning: schedule conflict identified" (no specifics, no punch)
- "Action required: commitment at risk" (corporate speak, no visceral reaction)

Return ONLY the headline, nothing else.`;

    try {
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.choices[0].message.content || '';
      return text.trim();

    } catch (error) {
      console.error('[IntelligentExtractor] Headline generation failed:', error);
      return conflict.headline;  // Fall back to original
    }
  }

  /**
   * Generate a pre-drafted solution for a conflict.
   * The goal is ONE CLICK to resolve.
   */
  static async generateDraftSolution(
    conflict: DetectedConflict,
    userContext: UserContext
  ): Promise<DraftSolution> {
    
    const prompt = `Generate a ready-to-send email that resolves this conflict.

CONFLICT:
${conflict.narrative}

USER:
Name: ${userContext.name}
Email: ${userContext.email}
Role: ${userContext.role}
Communication style: ${userContext.communicationStyle || 'professional'}

RECIPIENT:
${conflict.who_is_affected[0]}

REQUIREMENTS:
1. The email should be READY TO SEND - no placeholders like [INSERT X]
2. Be direct but diplomatic
3. Acknowledge the issue without excessive apology
4. Propose a clear resolution
5. Include a specific next step
6. Match the user's typical communication style

Return JSON:
{
  "to": "email@example.com",
  "subject": "Re: [relevant subject]",
  "body": "Full email body ready to send",
  "explanation": "Why this approach resolves the conflict"
}`;

    try {
      const client = getOpenAIClient();
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.choices[0].message.content || '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);

    } catch (error) {
      console.error('[IntelligentExtractor] Draft generation failed:', error);
      return {
        to: '',
        subject: 'Follow-up',
        body: 'I wanted to follow up on our recent discussion...',
        explanation: 'Generic follow-up (generation failed)',
      };
    }
  }

  /**
   * Analyze commitment patterns for an entity.
   * This builds the moat - learning how people actually behave.
   */
  static async analyzeEntityPatterns(
    entity: Entity,
    commitmentHistory: Commitment[],
    signalHistory: Signal[]
  ): Promise<PatternAnalysis> {
    
    // Calculate basic stats
    const totalCommitments = commitmentHistory.length;
    const fulfilled = commitmentHistory.filter(c => 
      c.resolution?.outcome === 'fulfilled_on_time' || 
      c.resolution?.outcome === 'fulfilled_late'
    ).length;
    const broken = commitmentHistory.filter(c => 
      c.resolution?.outcome === 'broken'
    ).length;

    // Calculate lateness
    const latenessData = commitmentHistory
      .filter(c => c.resolution?.resolvedAt && (c.dueAt || c.impliedDueAt))
      .map(c => {
        const deadline = c.dueAt || c.impliedDueAt!;
        const resolved = c.resolution!.resolvedAt;
        return (resolved.getTime() - deadline.getTime()) / (1000 * 60 * 60);  // hours
      });

    const avgLateness = latenessData.length > 0
      ? latenessData.reduce((a: number, b: number) => a + b, 0) / latenessData.length
      : 0;

    // Calculate response times from signals
    const responseTimes: number[] = [];
    // (Would need thread analysis to properly calculate)

    // Determine communication style
    const avgMessageLength = signalHistory.length > 0
      ? signalHistory.reduce((sum: number, s: Signal) => sum + s.content.length, 0) / signalHistory.length
      : 0;

    const style = avgMessageLength < 100 ? 'terse' : avgMessageLength > 500 ? 'verbose' : 'normal';

    return {
      fulfillmentRate: totalCommitments > 0 ? fulfilled / totalCommitments : 0.5,
      avgLatenessHours: avgLateness,
      communicationStyle: style,
      reliabilityScore: this.calculateReliability(fulfilled, broken, avgLateness),
      sampleSize: totalCommitments,
      insights: this.generatePatternInsights(fulfilled, broken, avgLateness, style),
    };
  }

  private static calculateReliability(
    fulfilled: number, 
    broken: number, 
    avgLateness: number
  ): number {
    const total = fulfilled + broken;
    if (total === 0) return 50;  // Neutral

    let score = 50;
    
    // Fulfillment rate (biggest factor)
    const rate = fulfilled / total;
    score += (rate - 0.5) * 60;

    // Lateness penalty
    if (avgLateness > 48) score -= 15;
    else if (avgLateness > 24) score -= 10;
    else if (avgLateness > 0) score -= 5;
    else if (avgLateness < 0) score += 5;  // Early delivery bonus

    return Math.max(0, Math.min(100, score));
  }

  private static generatePatternInsights(
    fulfilled: number,
    broken: number,
    avgLateness: number,
    style: string
  ): string[] {
    const insights: string[] = [];
    const total = fulfilled + broken;
    
    if (total >= 10) {
      const rate = fulfilled / total;
      if (rate >= 0.9) insights.push('Highly reliable - delivers 90%+ of commitments');
      else if (rate >= 0.7) insights.push('Generally reliable - delivers ~70% of commitments');
      else if (rate < 0.5) insights.push('⚠️ Reliability concern - less than 50% delivery rate');
    }

    if (avgLateness > 48) insights.push('⚠️ Pattern of late delivery (avg 2+ days late)');
    else if (avgLateness < -24) insights.push('Tends to deliver early');

    if (style === 'terse') insights.push('Communicates briefly - may need to ask clarifying questions');
    if (style === 'verbose') insights.push('Detailed communicator - good for complex projects');

    return insights;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractionResult {
  commitments: ExtractedCommitment[];
  amounts: ExtractedAmountRaw[];
  dates: ExtractedDateRaw[];
  entitiesMentioned: string[];
  tokensUsed: number;
}

export interface ExtractedCommitment {
  description: string;
  category: CommitmentCategory;
  promisor_email: string;
  promisee_email: string;
  explicit_deadline: string | null;
  implied_deadline_reason: string | null;
  stakes: string;
  confidence: number;
  context: string;
}

export interface ExtractedAmountRaw {
  raw: string;
  normalized: number;
  currency: string;
  context: string;
  type: 'revenue' | 'cost' | 'budget' | 'payment' | 'unknown';
  confidence: number;
}

export interface ExtractedDateRaw {
  raw: string;
  normalized: string;
  type: 'deadline' | 'event' | 'reference' | 'relative';
  context: string;
  confidence: number;
}

export interface ConflictDetectionResult {
  conflicts: DetectedConflict[];
  tokensUsed: number;
}

export interface DetectedConflict {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  headline: string;
  narrative: string;
  evidence: Array<{
    source: string;
    date: string;
    quote: string;
  }>;
  who_is_affected: string[];
  what_happens_if_ignored: string;
  suggested_resolution: string;
  urgency: 'immediate' | 'today' | 'this_week' | 'eventually';
}

export interface UserContext {
  name: string;
  email: string;
  role: string;
  keyRelationships: string[];
  communicationStyle?: string;
}

export interface DraftSolution {
  to: string;
  subject: string;
  body: string;
  explanation: string;
}

export interface PatternAnalysis {
  fulfillmentRate: number;
  avgLatenessHours: number;
  communicationStyle: 'terse' | 'normal' | 'verbose';
  reliabilityScore: number;
  sampleSize: number;
  insights: string[];
}

export default IntelligentExtractor;

