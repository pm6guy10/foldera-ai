import { expect, test, type Page, type Route } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';

loadEnv({ path: '.env.local' });

const HAS_NEXTAUTH_SECRET = Boolean(process.env.NEXTAUTH_SECRET?.trim());
const describeAuthMocked = HAS_NEXTAUTH_SECRET ? test.describe : test.describe.skip;
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT?.trim() || '3000';
const WEB_ORIGIN =
  process.env.PLAYWRIGHT_TEST_BASE_URL?.trim() ||
  process.env.BASE_URL?.trim() ||
  `http://127.0.0.1:${WEB_PORT}`;

function json(data: unknown) {
  return JSON.stringify(data);
}

function fulfillJson(data: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(data) });
}

function matchApiPath(apiPath: string) {
  return (url: URL | string): boolean => {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return parsed.pathname === apiPath || parsed.pathname === `${apiPath}/`;
    } catch {
      return false;
    }
  };
}

async function seedAuthenticatedSession(page: Page) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for outcome autopsy proof.');

  const sessionToken = await encode({
    secret,
    token: {
      sub: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      email: 'test@foldera.ai',
      name: 'Brandon Kapp',
      hasOnboarded: true,
    },
  });

  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: new URL('/', WEB_ORIGIN).href,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

const OUTCOME_AUTOPSY_PAYLOAD = {
  ok: true,
  artifact: {
    generated_at: '2026-05-15T12:00:00.000Z',
    source: 'stored_tkg_rows',
    query: 'CWU Access Specialist',
    goal: {
      id: 'goal-job-stability',
      text: 'Maintain family and household stability through job transition',
      status: 'active',
    },
    gold_standard_seed: {
      label: 'CWU Access Specialist Outcome Autopsy Gold Standard',
      context_source: 'user_provided_seed_context',
      privacy_policy:
        'Third-party student documentation is represented only as redacted/synthetic reasoning structure; raw student or medical details are not stored or displayed.',
    },
    final_outcome: 'Offer received and accepted from Central Washington University for Access Specialist',
    outcome_details: [
      { label: 'Employer', value: 'Central Washington University' },
      { label: 'Offer date', value: '2026-05-14' },
      { label: 'Salary', value: '$46,000' },
      { label: 'Tentative start', value: '2026-06-16' },
    ],
    causality: {
      label: 'Inferred, not proven',
      explanation:
        'The offer is confirmed by the seed context; the conversion mechanism is an after-action inference from the stored timeline, work-sample evidence, references, and process update.',
    },
    timeline: [
      {
        id: 'sig-cwu-follow-up',
        kind: 'signal',
        occurred_at: '2026-04-23T16:27:14.000Z',
        title: 'Follow-up email gave Kendall concrete availability',
        detail: 'Access Specialist role follow-up named interest and availability.',
        classifications: ['positive_momentum'],
        strength: 'strong_signal',
        source_ref: 'signal:sig-cwu-follow-up',
      },
      {
        id: 'sig-cwu-first-interview',
        kind: 'signal',
        occurred_at: '2026-04-24T18:00:00.000Z',
        title: 'CWU interview was scheduled with a Zoom link',
        detail: 'Calendar event for Access Specialist role CWU.',
        classifications: ['conversion_signal'],
        strength: 'strong_signal',
        source_ref: 'signal:sig-cwu-first-interview',
      },
      {
        id: 'sig-generic-newsletter',
        kind: 'signal',
        occurred_at: '2026-04-25T12:00:00.000Z',
        title: 'jobs@example.com',
        detail: 'Generic weekly job-search newsletter with broad interview tips.',
        classifications: [],
        strength: 'generic_event',
        source_ref: 'signal:sig-generic-newsletter',
      },
      {
        id: 'sig-cwu-second-interview',
        kind: 'signal',
        occurred_at: '2026-05-07T20:00:00.000Z',
        title: 'Second CWU interview appeared on the calendar',
        detail: 'Calendar event: CWU interview #2.',
        classifications: ['conversion_signal', 'outcome_confirmed'],
        strength: 'strong_signal',
        source_ref: 'signal:sig-cwu-second-interview',
      },
      {
        id: 'cwu-seed-realistic-job-simulation',
        kind: 'seed_context',
        occurred_at: '2026-05-03T12:00:00.000Z',
        title: 'Second-round prompt tested real Access Specialist judgment',
        detail:
          'The work sample required a 15-minute Access Planning Meeting presentation and case-note example.',
        classifications: ['conversion_signal', 'positive_momentum'],
        strength: 'strong_signal',
        source_ref: 'seed:second_round_prompt_email',
      },
      {
        id: 'cwu-seed-offer',
        kind: 'seed_context',
        occurred_at: '2026-05-14T18:00:00.000Z',
        title: 'Official CWU offer received',
        detail:
          'Central Washington University offered the Access Specialist role at $46,000 with a tentative June 16, 2026 start date.',
        classifications: ['outcome_confirmed'],
        strength: 'strong_signal',
        source_ref: 'seed:official_offer_letter',
      },
    ],
    strongest_positive_signals: [
      {
        id: 'sig-cwu-follow-up',
        label: 'Follow-up email gave Kendall concrete availability',
        occurred_at: '2026-04-23T16:27:14.000Z',
        classification: 'positive_momentum',
        why_strong: 'It gave the other side a low-friction next step instead of a vague check-in.',
        source_ref: 'signal:sig-cwu-follow-up',
      },
      {
        id: 'sig-cwu-first-interview',
        label: 'CWU interview was scheduled with a Zoom link',
        occurred_at: '2026-04-24T18:00:00.000Z',
        classification: 'conversion_signal',
        why_strong: 'It changes the state from interest or outreach into a scheduled interview step.',
        source_ref: 'signal:sig-cwu-first-interview',
      },
      {
        id: 'cwu-seed-realistic-job-simulation',
        label: 'Second-round prompt tested real Access Specialist judgment',
        occurred_at: '2026-05-03T12:00:00.000Z',
        classification: 'conversion_signal',
        why_strong:
          'It made the hiring process about live accommodation reasoning, documentation discipline, and student-centered judgment.',
        source_ref: 'seed:second_round_prompt_email',
      },
      {
        id: 'cwu-seed-offer',
        label: 'Official CWU offer received',
        occurred_at: '2026-05-14T18:00:00.000Z',
        classification: 'outcome_confirmed',
        why_strong:
          'It confirms the outcome while the playbook still labels the conversion logic as inferred.',
        source_ref: 'seed:official_offer_letter',
      },
    ],
    strongest_risks: [
      'Third-party student documentation is sensitive; only the redacted reasoning structure can be used as learning evidence.',
      'The salary counter created limited friction; accepting after a firm public-sector constraint preserved the win.',
    ],
    decisive_actions: [
      {
        id: 'action-cwu-follow-up',
        label: 'Send the Access Specialist follow-up to Kendall with concrete availability.',
        occurred_at: '2026-04-23T15:30:00.000Z',
        why_decisive: 'It turned an open loop into a specific next step with concrete availability.',
      },
    ],
    what_worked: [
      'The role matched judgment-heavy service coordination inside a messy human-support system.',
      'The second-round work simulation let Brandon demonstrate actual Access Specialist reasoning.',
    ],
    what_to_repeat: [
      'Treat every work sample, case scenario, presentation, or writing prompt as the highest-leverage conversion moment.',
      'Prepare around live judgment, one documentation/compliance answer, one collaboration answer, and a clean reference path.',
    ],
    what_to_avoid_next_time: [
      'Do not treat generic job-search events as strong evidence.',
      'Do not infer causality from timing alone.',
      'Do not store or display raw third-party student documentation as product proof.',
    ],
    high_signal_artifacts: [
      {
        id: 'second_round_prompt',
        label: 'Second-round Access Planning Meeting prompt',
        type: 'realistic_work_sample',
        sensitivity: 'personal_confidential',
        strength: 'very_high',
        why_it_mattered:
          'It let Brandon demonstrate actual job judgment instead of relying on broad resume claims.',
        source_ref: 'seed:second_round_prompt_email',
      },
      {
        id: 'redacted_case_packet',
        label: 'Redacted/synthetic student documentation summary',
        type: 'case_reasoning_structure',
        sensitivity: 'third_party_sensitive',
        strength: 'very_high',
        why_it_mattered:
          'Only the reasoning structure is usable: separate diagnosis from functional impact, identify requested accommodations, decide what needs clarification, and document neutrally.',
        source_ref: 'seed:redacted_case_packet',
      },
    ],
    evidence_vs_inference: {
      proven: [
        'Stored CWU follow-up and calendar signals show movement from outreach to interview scheduling.',
        'The seed context confirms the official offer, $46,000 salary, tentative June 16 start, and clean acceptance.',
      ],
      inferred: [
        'The strongest conversion mechanism was the realistic work sample because it tested the job itself.',
        'Reference activity and committee recommendation language indicate finalist-stage seriousness.',
      ],
      not_used_as_proof: [
        'Raw third-party student/medical documentation is not displayed or stored as production learning evidence.',
        'No numeric prediction or percent chance is used; this is an after-action playbook.',
      ],
    },
    future_roles_to_prioritize: ['Access or disability coordination', 'Student services operations'],
    future_roles_to_skip: ['Pure call center roles', 'High-volume remote generic admin roles'],
    generic_events: [
      {
        id: 'sig-generic-newsletter',
        label: 'jobs@example.com',
        occurred_at: '2026-04-25T12:00:00.000Z',
        classification: 'positive_momentum',
        why_strong: 'It is background context only, not strong evidence for the outcome.',
        source_ref: 'signal:sig-generic-newsletter',
      },
    ],
    reusable_playbook: {
      title: 'Judgment-heavy service coordination conversion playbook',
      steps: [
        'Find the hidden job thesis: casework, documentation, accommodation or eligibility logic, stakeholder coordination, and service-system judgment.',
        'When a case prompt or presentation appears, treat it as the conversion event and build around live reasoning.',
        'After the outcome, archive the signal trail, separate evidence from inference, and repeat the pattern only where the source trail supports it.',
      ],
    },
  },
};

describeAuthMocked('Outcome Autopsy playbook view', () => {
  test('Playbooks renders an Outcome Autopsy with signal/risk/playbook proof', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await page.route(matchApiPath('/api/auth/session'), fulfillJson({ user: { name: 'Brandon Kapp' }, expires: '2026-06-15T12:00:00.000Z' }));
    await page.route(matchApiPath('/api/outcome-autopsy/latest'), fulfillJson(OUTCOME_AUTOPSY_PAYLOAD));

    await page.goto('/dashboard/playbooks');

    await expect(page.getByTestId('outcome-autopsy-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Offer received and accepted from Central Washington University/i })).toBeVisible();
    await expect(page.getByText('Inferred, not proven')).toBeVisible();
    await expect(page.getByText('$46,000', { exact: true })).toBeVisible();
    await expect(page.getByText('CWU Access Specialist Outcome Autopsy Gold Standard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Strongest signals' })).toBeVisible();
    await expect(page.getByText('Follow-up email gave Kendall concrete availability').first()).toBeVisible();
    await expect(page.getByText('Second-round Access Planning Meeting prompt').first()).toBeVisible();
    await expect(page.getByText('third party sensitive').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inference' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Generic events kept out' })).toBeVisible();
    await expect(page.getByText('It is background context only, not strong evidence for the outcome.')).toBeVisible();
    await expect(page.getByText('Access or disability coordination')).toBeVisible();
    await expect(page.getByText('Pure call center roles')).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/probability/i);
    expect(bodyText).not.toMatch(/\b\d+%/);
    expect(bodyText).not.toMatch(/\bcaused\b/i);
  });
});
