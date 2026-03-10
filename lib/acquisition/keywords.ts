/**
 * Pain signal keywords for Foldera user acquisition.
 *
 * These match the core problem Foldera solves: feeling overwhelmed by email,
 * commitments, decisions, and professional obligations without support.
 *
 * Each keyword group has a weight. Posts accumulate a score based on how
 * many groups match (not raw keyword count). Only posts above MIN_SCORE
 * are drafted for outreach.
 */

export interface KeywordGroup {
  label:    string;    // Descriptive label for this pain cluster
  keywords: string[];  // Lowercase match strings (partial match, case-insensitive)
  weight:   number;    // Score contribution per match
}

export const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    label: 'overwhelmed by email',
    keywords: [
      'overwhelmed by email', 'inbox zero', 'email overload', 'email overwhelm',
      'drowning in emails', 'can\'t keep up with email', 'email management',
      'too many emails', 'email anxiety',
    ],
    weight: 2,
  },
  {
    label: 'tracking commitments',
    keywords: [
      'can\'t track everything', 'dropping the ball', 'forget to follow up',
      'missed commitments', 'track my commitments', 'follow-up system',
      'staying on top of everything', 'lost track',
    ],
    weight: 2,
  },
  {
    label: 'chief of staff / exec assistant',
    keywords: [
      'chief of staff', 'executive assistant', 'personal assistant',
      'need an assistant', 'virtual assistant', 'chief of staff for me',
    ],
    weight: 3,
  },
  {
    label: 'decision fatigue',
    keywords: [
      'decision fatigue', 'too many decisions', 'decision paralysis',
      'analysis paralysis', 'can\'t decide', 'overwhelmed with decisions',
    ],
    weight: 2,
  },
  {
    label: 'personal AI agent / automation',
    keywords: [
      'personal ai agent', 'ai assistant', 'ai chief of staff',
      'automate my email', 'automate follow-ups', 'ai for productivity',
      'proactive ai', 'autonomous agent for',
    ],
    weight: 2,
  },
  {
    label: 'productivity tools / GTD',
    keywords: [
      'gtd system', 'getting things done', 'second brain',
      'capture system', 'productivity system', 'life admin',
    ],
    weight: 1,
  },
  {
    label: 'relationship / outreach management',
    keywords: [
      'keep in touch', 'staying in touch', 'follow up with people',
      'networking crm', 'personal crm', 'relationship management',
      'outreach is hard', 'cold outreach',
    ],
    weight: 1,
  },
];

/** Minimum accumulated score required to draft outreach for a post */
export const MIN_SCORE = 2;

/**
 * Score a post title + body against the keyword groups.
 * Returns total score (0 = no match).
 */
export function scorePost(title: string, body: string): {
  score: number;
  matchedLabels: string[];
} {
  const text = `${title} ${body}`.toLowerCase();
  let score = 0;
  const matchedLabels: string[] = [];

  for (const group of KEYWORD_GROUPS) {
    const matched = group.keywords.some(kw => text.includes(kw));
    if (matched) {
      score += group.weight;
      matchedLabels.push(group.label);
    }
  }

  return { score, matchedLabels };
}

/**
 * Subreddits to search across — pain is concentrated here.
 */
export const TARGET_SUBREDDITS = [
  'productivity',
  'Entrepreneur',
  'startups',
  'ADHD',
  'lifehacks',
  'selfimprovement',
  'ExecAssistants',
  'BusinessOwners',
];
