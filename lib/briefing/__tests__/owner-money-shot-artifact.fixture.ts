import type { ConvictionArtifact, ConvictionDirective } from '../types';

export interface OwnerMoneyShotArtifactCase {
  id: string;
  expectedCategory?: string;
  expectedReason?: string;
  directive: Pick<ConvictionDirective, 'action_type' | 'directive' | 'reason' | 'evidence'>;
  artifact: ConvictionArtifact;
  sourceFacts?: string[];
  now?: Date;
}

function directive(
  actionType: ConvictionDirective['action_type'],
  text: string,
  reason: string,
  evidence: string[],
): OwnerMoneyShotArtifactCase['directive'] {
  return {
    action_type: actionType,
    directive: text,
    reason,
    evidence: evidence.map((description) => ({ type: 'signal', description })),
  };
}

export const OWNER_MONEY_SHOT_BAD_ARTIFACTS: OwnerMoneyShotArtifactCase[] = [
  {
    id: 'owner_bad_chc_alex_confirmation_garbage',
    expectedReason: 'action_type_mismatch',
    directive: directive('write_document', 'Create the Care Coordinator role-fit packet from Alex Crisler confirmation.', 'The confirmed Comprehensive Healthcare interview needs finished role-fit language, not another confirmation note.', [
      'Source Email: Alex Crisler at Comprehensive Healthcare confirmed the Care Coordinator phone screen for April 29 at 9 PM PT.',
      'Calendar source: Comprehensive Healthcare phone screen already exists on the calendar.',
    ]),
    artifact: {
      type: 'document',
      title: 'Confirmation Email to Alex Crisler - Care Coordinator Interview, April 29, 9 PM',
      content: [
        'Source Email: Alex Crisler at Comprehensive Healthcare confirmed the Care Coordinator phone screen for April 29 at 9 PM PT.',
        'To: Alex.Crisler@comphc.org',
        'Subject: Confirming Care Coordinator interview',
        'Hi Alex,',
        '',
        'Thank you for confirming tomorrow\'s call at 9 PM. I confirm that I will attend.',
        '',
        'Thanks,',
        'Brandon',
      ].join('\n'),
    },
  },
  {
    id: 'owner_bad_esb_technician_prep_homework',
    expectedReason: 'generic_coaching',
    directive: directive('write_document', 'Create finished ESB Technician interview work.', 'Darlene sent recruitment 2026-02344 interview details.', [
      'Source Email: Darlene Craig sent ESB Technician recruitment 2026-02344 interview details and interview timing.',
    ]),
    artifact: {
      type: 'document',
      title: 'ESB Technician Interview Prep - Recruitment 2026-02344',
      content: [
        'Source Email: Darlene Craig sent ESB Technician recruitment 2026-02344 interview details.',
        'Q1: Tell me about yourself.',
        'Q2: Why do you want this role?',
        'Q3: What is your customer service experience?',
        'Prepare STAR examples, review the agency website, check the dress code, and write questions to ask.',
      ].join('\n'),
    },
  },
  {
    id: 'owner_bad_generic_interview_checklist',
    expectedReason: 'generic_coaching',
    directive: directive('write_document', 'Create an interview artifact for current owner job search.', 'The artifact must be usable without rewriting.', [
      'Source Email: Interview invite references eligibility work, customer support, and virtual collaboration.',
    ]),
    artifact: {
      type: 'document',
      title: 'Generic interview checklist',
      content: 'Source Email: interview invite. Review the job description, prepare examples, practice your answers, research the organization, and think about questions to ask the panel.',
    },
  },
  {
    id: 'owner_bad_stale_reminder_only_interview',
    expectedReason: 'stale_event',
    now: new Date('2026-04-29T12:00:00.000Z'),
    directive: directive('write_document', 'Prepare for the interview on 2026-04-21.', 'The output is stale and reminder-only.', [
      'Calendar source: ESB Technician interview was scheduled on 2026-04-21.',
    ]),
    artifact: {
      type: 'document',
      title: 'Interview reminder',
      content: 'Source: calendar. Your ESB Technician interview is tomorrow, 2026-04-21. Prepare accordingly and review your notes.',
    },
  },
  {
    id: 'owner_bad_resend_onboarding_decision_pressure',
    expectedReason: 'transactional_sender_decision_pressure',
    directive: directive('write_document', 'Create the Resend relationship decision map.', 'onboarding@resend.dev has been silent for 32 days.', [
      'Source Email: onboarding@resend.dev sent a Resend onboarding message and has been silent for 32 days.',
      'Interview source: separate owner job-search interviews exist, but no Resend employer, vendor, or relationship obligation is confirmed.',
    ]),
    artifact: {
      type: 'document',
      title: 'Resend Relationship Status & Interview Decision Map',
      content: [
        'Source Email: onboarding@resend.dev has been silent for 32 days after the Resend onboarding message.',
        'Decision: decide today whether this Resend relationship is still active or whether you have moved on.',
        'Criteria: because accepting another job may create reputational or professional risk if the Resend silence is not addressed first.',
        'Next action: resolve the Resend status before any external decision is final.',
        'This matters now: the silence must be addressed before interview decisions become locked.',
      ].join('\n'),
    },
  },
];

export const OWNER_MONEY_SHOT_GOOD_ARTIFACT: OwnerMoneyShotArtifactCase = {
  id: 'owner_good_finished_esb_role_fit_packet',
  expectedCategory: 'ROLE_FIT_PACKET',
  directive: directive('write_document', 'Deliver the finished ESB Technician role-fit answer packet for Brandon.', 'The interview thread and resume-shaped facts support one specific answer Brandon can use as-is.', [
    'Source Email: Darlene Craig sent ESB Technician recruitment 2026-02344 interview details.',
    'Resume source: customer support, eligibility documentation, call volume, compliance follow-through.',
  ]),
  artifact: {
    type: 'document',
    title: 'ESB Technician role-fit answer packet',
    content: [
      'Source Email: Darlene Craig - ESB Technician recruitment 2026-02344 interview details.',
      'Resume source: customer support, eligibility documentation, call volume, compliance follow-through.',
      '',
      'Use this answer when the panel asks why this role fits:',
      'I am strongest in eligibility work when accuracy, speed, and plain-language service all have to happen at the same time. I have handled customer questions, kept documentation complete, and followed compliance steps without making the person on the other side feel like a ticket. For this ESB Technician role, I would bring steady queue discipline, careful eligibility follow-through, and a calm explanation of the next step for each caller.',
      '',
      'Concrete next action: use this answer as the opening role-fit response; if the panel asks for an example, tie it back to customer support plus complete documentation.',
    ].join('\n'),
  },
};
