export const INTAKE_CLASSIFICATIONS = [
  'VISION',
  'AUDIT_FINDING',
  'ACTIVE_SEAM_COMMAND',
  'BLOCKER_REPORT',
  'BUSINESS_PLAN_UPDATE',
  'ARCHITECTURE_DOCTRINE',
  'PRODUCT_PROOF',
  'REPO_HYGIENE',
  'LESSON_LEARNED',
  'REFERENCE_ONLY',
  'UNSAFE_EXPANSION',
  'OPEN_THREAD_CAPTURE',
] as const;

export type IntakeClassification = (typeof INTAKE_CLASSIFICATIONS)[number];

export type RoutingOutcome =
  | 'open-thread capture'
  | 'comment/update existing issue'
  | 'create one new issue'
  | 'update active seam'
  | 'no-action receipt'
  | 'blocked receipt'
  | 'reference-only receipt';

export type YesNo = 'YES' | 'NO';

export type IntakeContext = {
  activeIssue: number;
  activeIssueTitle?: string;
  openThreadsIssue: number;
  ledgerIssue: number;
};

export type ClassificationResult = {
  classification: IntakeClassification;
  bucket: string;
};

export type IntakePacket = {
  classification: IntakeClassification;
  bucket: string;
  routingOutcome: RoutingOutcome;
  existingGithubTarget: string;
  newIssueNeeded: YesNo;
  activeSeamImpact: YesNo;
  why: string;
  oneNextMove: string;
  forbiddenWork: string;
  proofRequired: string;
  stopCondition: string;
};

export const DEFAULT_INTAKE_CONTEXT: IntakeContext = {
  activeIssue: 166,
  activeIssueTitle: 'Repo Intake Governor v0 - classify owner input into repo truth',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};
