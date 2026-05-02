import type { ConvictionArtifact, ConvictionDirective } from '../types';

export interface ArtifactGoldCase {
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
): ArtifactGoldCase['directive'] {
  return {
    action_type: actionType,
    directive: text,
    reason,
    evidence: evidence.map((description) => ({ type: 'signal', description })),
  };
}

export const BAD_ARTIFACT_GOLD_SET_V1_2: ArtifactGoldCase[] = [
  {
    id: 'bad_generic_follow_up_darlene',
    expectedReason: 'only_follow_up_check_in_or_monitor',
    directive: directive('send_message', 'Follow up with Darlene.', 'No specific outcome was identified.', [
      'Email thread from Darlene Craig about ES Benefits Technician recruitment 2026-02344.',
    ]),
    artifact: {
      type: 'email',
      to: 'darlene@example.com',
      subject: 'Checking in',
      body: 'Hi Darlene,\n\nJust checking in to follow up and see how things are going.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'bad_star_homework',
    expectedReason: 'generic_coaching',
    directive: directive('write_document', 'Prepare for the ES Benefits Technician interview.', 'Interview is upcoming.', [
      'Source Email: Darlene Craig sent ES Benefits Technician interview details.',
    ]),
    artifact: {
      type: 'document',
      title: 'ES Benefits Technician Interview Prep',
      content: 'Source Email: Darlene Craig. Prepare STAR examples, review the website, check dress code, and practice questions to ask.',
    },
  },
  {
    id: 'bad_generic_thank_you',
    expectedReason: 'no_concrete_outcome',
    directive: directive('send_message', 'Send thank you note.', 'No specific thread or role anchor was provided.', [
      'Interview email from recruiter.',
    ]),
    artifact: {
      type: 'email',
      to: 'recruiter@example.com',
      subject: 'Thank you',
      body: 'Hi,\n\nThank you for your time. I appreciate the opportunity and look forward to hearing from you.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'bad_tomorrow_reminder',
    expectedReason: 'reminder_only',
    directive: directive('write_document', 'Interview is tomorrow.', 'Reminder only.', [
      'Calendar event: ES Benefits Technician interview on 2026-05-02.',
    ]),
    artifact: {
      type: 'document',
      title: 'Interview reminder',
      content: 'Source: calendar. Your ES Benefits Technician interview is tomorrow. Prepare accordingly.',
    },
  },
  {
    id: 'bad_vague_risk',
    expectedReason: 'no_concrete_outcome',
    directive: directive('write_document', 'Watch risk.', 'Risk exists.', ['Email signal mentioned a possible delay.']),
    artifact: {
      type: 'document',
      title: 'Risk note',
      content: 'Evidence: there may be a risk. It could matter soon. Keep an eye on it.',
    },
  },
  {
    id: 'bad_nothing_cleared_bar_email',
    expectedReason: 'no_concrete_outcome',
    directive: directive('send_message', 'Nothing cleared the bar today.', 'Generic no-send filler.', [
      'Daily brief candidate failure reasons existed.',
    ]),
    artifact: {
      type: 'email',
      to: 'owner@example.com',
      subject: 'Foldera: Nothing cleared the bar today',
      body: 'Nothing cleared the bar today. Monitor your inbox and check back tomorrow.\n\nThanks,\nFoldera',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'bad_generic_check_in_alex',
    expectedReason: 'only_follow_up_check_in_or_monitor',
    directive: directive('send_message', 'Check in with Alex.', 'No concrete outcome.', [
      'Comprehensive Healthcare phone screen thread with Alex Crisler.',
    ]),
    artifact: {
      type: 'email',
      to: 'alex@example.com',
      subject: 'Quick check-in',
      body: 'Hi Alex,\n\nI wanted to check in and see if there are any updates.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'bad_internal_debug_sludge',
    expectedReason: 'internal_debug_token',
    directive: directive('write_document', 'candidate blocked', 'provider_error request_id req_abc123', [
      'Internal generator error row.',
    ]),
    artifact: {
      type: 'document',
      title: 'All candidates blocked',
      content: 'request_id=req_abc123 provider_error invalid_request_error llm_failed candidate blocked.',
    },
  },
  {
    id: 'bad_summary_pretending_artifact',
    expectedReason: 'summary_only',
    directive: directive('write_document', 'Summarize the interview thread.', 'Summary only.', [
      'Source Email: Darlene Craig sent ES Benefits Technician interview details.',
    ]),
    artifact: {
      type: 'document',
      title: 'Interview summary',
      content: 'Source Email: Darlene Craig. Summary: the interview is about customer service, systems, and teamwork.',
    },
  },
  {
    id: 'bad_generic_questions_to_ask',
    expectedReason: 'generic_coaching',
    directive: directive('write_document', 'Prepare questions to ask.', 'Interview prep.', [
      'Calendar event: interview with Comprehensive Healthcare.',
    ]),
    artifact: {
      type: 'document',
      title: 'Questions to ask',
      content: 'Source: calendar. Questions to ask: What does success look like? What are the next steps? Review the website first.',
    },
  },
  {
    id: 'bad_dressed_up_filler',
    expectedReason: 'prepare_instead_of_finished_work',
    directive: directive('write_document', 'Create role-fit prep.', 'Needs finished work.', [
      'Source Email: Darlene Craig sent ES Benefits Technician interview details.',
    ]),
    artifact: {
      type: 'document',
      title: 'Role fit brief',
      content: 'Source Email: Darlene Craig. Consider preparing examples about customer service and reviewing your notes before the interview.',
    },
  },
  {
    id: 'bad_fabricated_specificity',
    expectedReason: 'fabricated_claim',
    directive: directive('write_document', 'Create ProviderOne answer.', 'Must be grounded.', [
      'Resume source: customer service, call center support, compliance documentation.',
    ]),
    artifact: {
      type: 'document',
      title: 'ProviderOne answer',
      content: 'Source: resume. First-person answer: I used ProviderOne at HCA for five years and managed eligibility queues across ESD.',
    },
  },
  {
    id: 'bad_long_star_prep_doc',
    expectedReason: 'generic_coaching',
    directive: directive('write_document', 'Create interview document.', 'Prep doc.', [
      'Source Email: ES Benefits Technician interview details.',
    ]),
    artifact: {
      type: 'document',
      title: 'Long interview prep document',
      content: 'Source Email: ES Benefits Technician. Use the STAR framework for every answer, research the company, review the website, prepare examples, and plan what to wear.',
    },
  },
  {
    id: 'bad_source_grounded_reminder',
    expectedReason: 'reminder_only',
    directive: directive('write_document', 'Interview tomorrow.', 'Reminder.', [
      'Email says interview is tomorrow.',
    ]),
    artifact: {
      type: 'document',
      title: 'Tomorrow reminder',
      content: 'Source Email: email says interview is tomorrow; prepare accordingly.',
    },
  },
  {
    id: 'bad_named_source_no_outcome',
    expectedReason: 'no_concrete_outcome',
    directive: directive('write_document', 'Use named source.', 'No outcome.', [
      'Source Email: Darlene Craig sent details.',
    ]),
    artifact: {
      type: 'document',
      title: 'Darlene source note',
      content: 'Source Email: Darlene Craig. The thread contains useful context about the role and timing.',
    },
  },
  {
    id: 'bad_monitor_inbox_only',
    expectedReason: 'only_follow_up_check_in_or_monitor',
    directive: directive('write_document', 'Monitor inbox.', 'Only action is monitor.', [
      'Source Email: Don may reply about reference.',
    ]),
    artifact: {
      type: 'document',
      title: 'Reference watch',
      content: 'Source Email: Don reference thread. Monitor inbox for any replies.',
    },
  },
  {
    id: 'bad_stale_interview_prep',
    expectedReason: 'stale_event',
    now: new Date('2026-04-28T12:00:00.000Z'),
    directive: directive('write_document', 'Prepare for interview on 2026-04-21.', 'Interview date passed.', [
      'Calendar event: ES Benefits Technician interview on 2026-04-21.',
    ]),
    artifact: {
      type: 'document',
      title: 'ES Benefits Technician prep',
      content: 'Source: calendar. Prepare for the ES Benefits Technician interview on 2026-04-21 by reviewing STAR examples.',
    },
  },
  {
    id: 'bad_placeholders',
    expectedReason: 'placeholder_content',
    directive: directive('send_message', 'Draft exact reply.', 'Placeholder leak.', [
      'Source Email: Don reference request.',
    ]),
    artifact: {
      type: 'email',
      to: 'don@example.com',
      subject: 'Reference for [NAME]',
      body: 'Hi Don,\n\nPlease send the reference by [DATE]. Insert specific detail here.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
];

export const GOOD_ARTIFACT_GOLD_SET_V1_2: ArtifactGoldCase[] = [
  {
    id: 'good_es_benefits_role_fit_packet',
    expectedCategory: 'ROLE_FIT_PACKET',
    directive: directive('write_document', 'Use finished ES Benefits Technician role-fit answer packet.', 'Interview answer packet grounded in source email and resume facts.', [
      'Source Email: Darlene Craig sent ES Benefits Technician recruitment 2026-02344 interview details.',
      'Resume source: call center support, eligibility documentation, compliance follow-through, customer service.',
    ]),
    artifact: {
      type: 'document',
      title: 'ES Benefits Technician role-fit answer packet',
      content: 'Source Email: Darlene Craig - ES Benefits Technician recruitment 2026-02344. Resume source: call center support, eligibility documentation, compliance follow-through, customer service. First-person answer: I bring calm, accurate service in high-volume eligibility settings. I can translate policy into clear next steps for callers while keeping documentation complete and auditable. I have handled customer questions, tracked details across systems, and followed compliance rules without losing the human tone of the conversation. Use this answer as-is for the role-fit question.',
    },
  },
  {
    id: 'good_schedule_conflict_resolution_message',
    expectedCategory: 'DRAFT_EMAIL',
    directive: directive('send_message', 'Resolve schedule conflict with Alex by 3 PM today.', 'Two calendar blocks overlap today.', [
      'Calendar source: Comprehensive Healthcare phone screen conflicts with CHC bridge-job shift discussion at 3 PM.',
    ]),
    artifact: {
      type: 'email',
      to: 'alex@example.com',
      subject: 'Schedule conflict today - can we move the phone screen?',
      body: 'Hi Alex,\n\nI have a calendar conflict with the Comprehensive Healthcare phone screen today. Could we move the call to tomorrow morning or after 3 PM PT today? I can confirm either option as soon as you reply.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'good_reference_prebrief_don',
    expectedCategory: 'DRAFT_EMAIL',
    directive: directive('send_message', 'Send Don reference pre-brief by noon.', 'Reference packet needs exact language today.', [
      'Source Email: Don agreed to provide a reference for ES Benefits Technician recruitment 2026-02344.',
    ]),
    artifact: {
      type: 'email',
      to: 'don@example.com',
      subject: 'Reference pre-brief for ES Benefits Technician role',
      body: 'Hi Don,\n\nThank you for being willing to serve as a reference for the ES Benefits Technician role. If they call today, the most useful points are my accuracy with eligibility documentation, calm customer service, and follow-through on compliance details. A concise example of that would help them connect my background to the role.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'good_providerone_fit_line',
    expectedCategory: 'ROLE_FIT_LINE',
    directive: directive('write_document', 'Create ProviderOne compliance fit signal line.', 'Needs one quotable line grounded in source facts.', [
      'Source: job posting values ProviderOne familiarity, eligibility accuracy, and compliance documentation.',
      'Resume source: eligibility documentation and customer support.',
    ]),
    artifact: {
      type: 'document',
      title: 'ProviderOne compliance fit line',
      content: 'Source: job posting values ProviderOne familiarity, eligibility accuracy, and compliance documentation. Quotable line: "I make eligibility work reliable by pairing careful system documentation with plain-language customer support." When to use: use this when asked why your background fits ProviderOne-heavy eligibility work.',
    },
  },
  {
    id: 'good_chc_bridge_decision',
    expectedCategory: 'DECISION_BRIEF',
    directive: directive('write_document', 'Decide CHC bridge-job response today.', 'The CHC option competes with interview prep time this week.', [
      'Source Email: CHC bridge-job thread asks for availability this week.',
      'Calendar source: ES Benefits Technician interview prep window closes tomorrow.',
    ]),
    artifact: {
      type: 'document',
      title: 'CHC bridge-job decision',
      content: 'Source Email: CHC bridge-job thread asks for availability this week. Decision: decline any CHC shift that overlaps the ES Benefits Technician interview prep window. Deciding criterion: preserve the higher-upside interview while keeping CHC warm. Next action: reply today with availability after the interview window closes. Trigger: if CHC needs an answer before noon, send the availability note immediately.',
    },
  },
  {
    id: 'good_interview_confirmation_email',
    expectedCategory: 'DRAFT_EMAIL',
    directive: directive('send_message', 'Confirm ES Benefits Technician interview.', 'Recruiter asked for concise confirmation.', [
      'Source Email: Darlene Craig scheduled ES Benefits Technician interview for May 2 at 10 AM PT.',
    ]),
    artifact: {
      type: 'email',
      to: 'darlene@example.com',
      subject: 'Confirming ES Benefits Technician interview on May 2',
      body: 'Hi Darlene,\n\nThank you for scheduling the ES Benefits Technician interview for May 2 at 10 AM PT. I confirm that time works for me, and I will be ready at the scheduled start time.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'good_reference_sensitive_opportunity',
    expectedCategory: 'DRAFT_EMAIL',
    directive: directive('send_message', 'Ask Don for a narrow reference action today.', 'Reference-sensitive opportunity needs exact ask.', [
      'Source Email: Don is the reference contact for ES Benefits Technician recruitment 2026-02344.',
    ]),
    artifact: {
      type: 'email',
      to: 'don@example.com',
      subject: 'One specific reference point for ES Benefits Technician',
      body: 'Hi Don,\n\nFor the ES Benefits Technician reference, could you emphasize my accuracy, follow-through, and calm customer service under volume? That is the exact bridge between my background and what this role appears to need.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    },
  },
  {
    id: 'good_skip_suppression_decision',
    expectedCategory: 'SUPPRESSION_DECISION',
    directive: directive('do_nothing', 'Suppress stale interview prep.', 'The interview already occurred, so sending prep would reduce trust.', [
      'Calendar source: interview date 2026-04-21 is already past.',
    ]),
    artifact: {
      type: 'wait_rationale',
      context: 'Suppression decision: stale interview prep was detected after the 2026-04-21 interview date.',
      evidence: 'Source: calendar interview date already passed. Do not send prep; wait for a new outcome signal.',
      tripwires: ['New recruiter follow-up', 'New reference request'],
    },
  },
  {
    id: 'good_providerone_accuracy_answer',
    expectedCategory: 'ROLE_FIT_PACKET',
    directive: directive('write_document', 'Create ProviderOne accuracy answer for HCA/ESD interviews.', 'Needs finished language grounded in job and resume facts.', [
      'Job source: HCA/ESD interviews value ProviderOne accuracy, eligibility rules, and customer service.',
      'Resume source: eligibility documentation, customer support, compliance follow-through.',
    ]),
    artifact: {
      type: 'document',
      title: 'ProviderOne accuracy answer',
      content: 'Source: HCA/ESD interviews value ProviderOne accuracy, eligibility rules, and customer service. Resume source: eligibility documentation, customer support, compliance follow-through. First-person answer: I treat eligibility accuracy as both a customer-service issue and a compliance issue. I slow down enough to verify the rule, document the outcome clearly, and explain the next step in plain language. That matters in ProviderOne-heavy work because the person on the phone needs confidence that the answer is both understandable and correct. Use this answer verbatim.',
    },
  },
  {
    id: 'good_one_page_executive_brief_with_finished_answer',
    expectedCategory: 'ROLE_FIT_PACKET',
    directive: directive('write_document', 'Create one-page executive brief with finished answer.', 'The answer itself must be present.', [
      'Source Email: ES Benefits Technician interview focuses on accuracy, call volume, virtual collaboration.',
      'Resume source: customer support, documentation, compliance follow-through.',
    ]),
    artifact: {
      type: 'document',
      title: 'One-page ES Benefits Technician executive brief',
      content: 'Source Email: ES Benefits Technician interview focuses on accuracy, call volume, virtual collaboration. Resume source: customer support, documentation, compliance follow-through. Finished answer: I am strongest in roles where accuracy and customer calm both matter. I can handle volume without treating people like tickets, and I document decisions so the next person can trust the record. In this role, I would bring steady communication, careful eligibility follow-through, and a bias toward clear next steps for every caller. Use this as the final opening answer.',
    },
  },
];

export const STALE_INTERVIEW_SUPPRESSION_FIXTURE: ArtifactGoldCase = BAD_ARTIFACT_GOLD_SET_V1_2.find(
  (item) => item.id === 'bad_stale_interview_prep',
) as ArtifactGoldCase;
