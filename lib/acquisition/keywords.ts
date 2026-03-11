/**
 * Pain signal keywords for Foldera user acquisition.
 *
 * Three tiers exactly matching GROWTH.md — updated as we learn what resonates.
 * Weights feed into scorer.ts for the 0-100 scoring system.
 *
 * Tier 1 (weight 3): ICP is actively searching for a chief of staff / assistant
 * Tier 2 (weight 2): ICP is experiencing core pains Foldera directly solves
 * Tier 3 (weight 1): Adjacent productivity pain — lower signal, still trackable
 */

export interface KeywordGroup {
  label:    string;
  keywords: string[];
  weight:   number;
  tier:     1 | 2 | 3;
}

export const KEYWORD_GROUPS: KeywordGroup[] = [

  // Tier 1: Highest signal (weight 3)
  {
    label: 'chief of staff / executive assistant',
    tier: 1,
    keywords: [
      'chief of staff',
      'executive assistant',
      'personal assistant',
      'need an assistant',
      'virtual assistant',
      'ai chief of staff',
      'chief of staff for me',
      'hire an ea',
      "can't afford an ea",
      'no executive assistant',
    ],
    weight: 3,
  },

  // Tier 2: High signal (weight 2)
  {
    label: 'overwhelmed by email',
    tier: 2,
    keywords: [
      'overwhelmed by email',
      'email overload',
      'email overwhelm',
      'drowning in emails',
      "can't keep up with email",
      'too many emails',
      'email anxiety',
      'inbox zero',
      'inbox overflowing',
    ],
    weight: 2,
  },
  {
    label: 'dropping the ball / missed commitments',
    tier: 2,
    keywords: [
      'dropping the ball',
      'forget to follow up',
      'missed commitments',
      'lost track',
      "can't track everything",
      'track my commitments',
      'follow-up system',
      'staying on top of everything',
      'falling through the cracks',
      'things falling through the cracks',
    ],
    weight: 2,
  },
  {
    label: 'decision fatigue',
    tier: 2,
    keywords: [
      'decision fatigue',
      'too many decisions',
      'decision paralysis',
      'analysis paralysis',
      "can't decide",
      'overwhelmed with decisions',
      'so many decisions',
    ],
    weight: 2,
  },
  {
    label: 'personal ai agent / automation',
    tier: 2,
    keywords: [
      'personal ai agent',
      'ai assistant',
      'automate my email',
      'automate follow-ups',
      'ai for productivity',
      'proactive ai',
      'autonomous agent',
      'ai that manages',
      'ai that handles',
    ],
    weight: 2,
  },

  // Tier 3: Medium signal (weight 1)
  {
    label: 'second brain / productivity system',
    tier: 3,
    keywords: [
      'second brain',
      'getting things done',
      'gtd system',
      'capture system',
      'productivity system',
      'life admin',
      'personal operating system',
    ],
    weight: 1,
  },
  {
    label: 'relationship / outreach management',
    tier: 3,
    keywords: [
      'personal crm',
      'keep in touch',
      'staying in touch',
      'follow up with people',
      'networking crm',
      'relationship management',
      'outreach is hard',
    ],
    weight: 1,
  },
];

// Tier 1 subreddits from GROWTH.md
export const TARGET_SUBREDDITS = [
  'Entrepreneur',
  'ADHD',
  'startups',
  'productivity',
  'ExecAssistants',
  'BusinessOwners',
  'lifehacks',
  'selfimprovement',
];

// Keep low — scanner pre-filters only; scorer.ts applies the 0-100 real threshold
export const MIN_SCORE = 2;

// Max possible raw score (all groups match): 3+2+2+2+2+1+1 = 13
export const MAX_RAW_SCORE = KEYWORD_GROUPS.reduce((sum, g) => sum + g.weight, 0);

/**
 * Score a post against keyword groups.
 * Returns raw weight sum + matched labels.
 * For 0-100 scoring use scorer.ts.
 */
export function scorePost(
  title: string,
  body:  string,
): { score: number; matchedLabels: string[] } {
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
