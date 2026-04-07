/**
 * Vitest resolution alias for `@anthropic-ai/sdk` — **never performs HTTP**.
 *
 * Individual test files may still `vi.mock('@anthropic-ai/sdk', ...)`; those factories
 * take precedence over this module.
 *
 * Branches are keyed off `system` / `max_tokens` / user content shapes that production
 * code uses, so incidental imports (e.g. `scoreOpenLoops` in integration-style tests)
 * do not hit api.anthropic.com.
 */

type Message = { role?: string; content?: string | unknown };

type CreateParams = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  system?: string;
  messages?: Message[];
  tools?: unknown[];
};

const usage = { input_tokens: 0, output_tokens: 0 };

function textResponse(text: string) {
  return Promise.resolve({
    usage,
    content: [{ type: 'text' as const, text }],
  });
}

const emptySignalExtractionArray = '[]';

const emptyIdentityExtractionJson = JSON.stringify({
  decisions: [],
  outcomes: [],
  patterns: [],
  goals: [],
});

/** Minimal directive JSON that tends to survive generator parse + enforcement in tests. */
const offlineDirectiveJson = JSON.stringify({
  directive:
    'Request Arman\'s yes/no contract decision and owner assignment by 4 PM PT today.',
  artifact_type: 'send_message',
  artifact: {
    to: 'arman.petrov@partnerfirm.io',
    subject: 'Decision needed today: contract path owner by 4 PM PT',
    body:
      'Hi Arman,\n\nCan you confirm by 4 PM PT today whether we should proceed with contract path A or B, and name the owner for execution? If we miss this cutoff, legal review slips to next week.\n\nBest,\nBrandon',
  },
  evidence: 'Arman asked for an update and has not received a reply.',
  why_now: 'The unresolved owner blocks legal review and today is the last workable decision window.',
  causal_diagnosis: {
    why_exists_now: 'The thread asks for approval but no owner has accepted accountability.',
    mechanism: 'Unowned dependency before deadline.',
  },
  decision: 'ACT',
});

const offlineArtifactDocumentJson = JSON.stringify({
  type: 'document',
  title: 'Vitest offline artifact stub',
  content:
    'This is synthetic document content from the Vitest Anthropic SDK stub. It exists only to satisfy ' +
    'offline tests and must not be shown to users. It is long enough to pass typical minimum-length gates.',
});

export default class Anthropic {
  constructor(_opts?: { apiKey?: string }) {}

  messages = {
    create: (params: CreateParams) => {
      const system = typeof params.system === 'string' ? params.system : '';
      const maxTok = params.max_tokens ?? 0;
      const first = params.messages?.[0];
      const user0 =
        first && typeof first.content === 'string'
          ? first.content
          : '';

      // Goal refresh (cron) — plain text, not JSON
      if (user0.includes('Rewrite the goal text to include specific entity names')) {
        return textResponse('Vitest stub: enriched goal with Example Entity (offline).');
      }

      // Multimodal / vision agent path
      if (Array.isArray(first?.content)) {
        return textResponse('{"vitest":"vision_stub"}');
      }

      // Signal batch extraction (emails/calendar/…) — JSON array of extractions
      if (system.includes('You are extracting structured data from raw signals')) {
        return textResponse(emptySignalExtractionArray);
      }

      // Conversation / identity-graph extraction prompts
      if (system.includes('You are building an identity graph for a personal chief of staff system')) {
        return textResponse(emptyIdentityExtractionJson);
      }

      // Weekly signal summarizer
      if (system.includes('compress raw signals into a weekly digest')) {
        return textResponse(
          JSON.stringify({
            text: 'Week of stub: offline vitest summarizer.',
            themes: [],
            people: [],
            tone: 'neutral',
          }),
        );
      }

      // Generator — pass-1 anomaly
      if (maxTok === 150 && system.includes('one factual sentence')) {
        return textResponse('Stub anomaly sentence for vitest offline Anthropic stub.');
      }

      // Main directive generation
      if (system.startsWith('SYSTEM — FOLDERA CONVICTION ENGINE')) {
        return textResponse(offlineDirectiveJson);
      }

      // Researcher — synthesis / enrichment JSON
      if (system.includes('You are a research analyst finding non-obvious connections')) {
        return textResponse(JSON.stringify({ synthesis: null }));
      }
      if (system.includes('Return only verifiable public facts')) {
        return textResponse(JSON.stringify({ external_context: null }));
      }

      // Insight scan — user-only prompt, high max_tokens
      if (!system && maxTok === 2000) {
        return textResponse(emptySignalExtractionArray);
      }

      // Artifact generator — discrepancy transform (typical 800) vs full artifact (4000)
      if (maxTok === 800) {
        return textResponse(offlineArtifactDocumentJson);
      }
      if (maxTok === 4000) {
        return textResponse(offlineArtifactDocumentJson);
      }

      // Agent runner (4096, non-FOLDERA system)
      if (maxTok === 4096 && !system.startsWith('SYSTEM — FOLDERA CONVICTION ENGINE')) {
        return textResponse('Vitest offline agent stub response.');
      }

      // Safe default: empty extraction-style payload
      return textResponse(emptyIdentityExtractionJson);
    },
  };
}
