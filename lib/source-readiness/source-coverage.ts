export type SourceDepth = 'thin' | 'usable' | 'rich';
export type MagicReadiness =
  | 'not_ready'
  | 'obligation_only'
  | 'context_ready'
  | 'operator_ready';

export type NextBestConnector =
  | 'google_drive'
  | 'onedrive'
  | 'slack'
  | 'teams'
  | 'tasks'
  | null;

export type SourceCoverage = {
  has_email: boolean;
  has_calendar: boolean;
  has_docs: boolean;
  has_chat: boolean;
  has_tasks: boolean;
  processed_signal_count: number;
  recent_signal_window_days: number;
  source_depth: SourceDepth;
  magic_readiness: MagicReadiness;
  next_best_connector: NextBestConnector;
  reason: string;
};

export type SourceCoverageInput = {
  connected_providers: string[];
  recent_processed_signal_sources: string[];
  processed_signal_count: number;
  recent_signal_window_days?: number;
};

const EMAIL_SOURCES = new Set(['gmail', 'outlook']);
const CALENDAR_SOURCES = new Set(['google_calendar', 'outlook_calendar']);
const DOC_SOURCES = new Set(['drive', 'onedrive']);
const CHAT_SOURCES = new Set(['slack', 'teams']);
const TASK_SOURCES = new Set(['microsoft_todo', 'tasks']);
const DEFAULT_RECENT_SIGNAL_WINDOW_DAYS = 30;
const MIN_USABLE_PROCESSED_SIGNALS = 4;

function clampCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeValues(values: string[]): Set<string> {
  return new Set(
    values
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function includesAny(values: Set<string>, expected: Set<string>): boolean {
  for (const value of values) {
    if (expected.has(value)) return true;
  }
  return false;
}

function preferredDocsConnector(connectedProviders: Set<string>): 'google_drive' | 'onedrive' {
  return connectedProviders.has('microsoft') || connectedProviders.has('azure_ad')
    ? 'onedrive'
    : 'google_drive';
}

function nextBestConnector(input: {
  connectedProviders: Set<string>;
  hasDocs: boolean;
  hasChat: boolean;
  hasTasks: boolean;
}): NextBestConnector {
  if (!input.hasDocs) return preferredDocsConnector(input.connectedProviders);
  if (!input.hasChat) {
    return input.connectedProviders.has('microsoft') || input.connectedProviders.has('azure_ad')
      ? 'teams'
      : 'slack';
  }
  if (!input.hasTasks) return 'tasks';
  return null;
}

function connectorReason(connector: NextBestConnector): string {
  switch (connector) {
    case 'google_drive':
      return 'Google Drive adds document context so Foldera can see the work behind the obligations.';
    case 'onedrive':
      return 'OneDrive adds document context so Foldera can see the work behind the obligations.';
    case 'slack':
      return 'Slack adds active-work context so Foldera can see where decisions are moving right now.';
    case 'teams':
      return 'Teams adds active-work context so Foldera can see where decisions are moving right now.';
    case 'tasks':
      return 'Tasks add execution context so Foldera can tell what is assigned, moving, or stuck.';
    default:
      return 'Foldera has enough live source variety to make a trustworthy Today read.';
  }
}

export function buildSourceCoverage(input: SourceCoverageInput): SourceCoverage {
  const connectedProviders = normalizeValues(input.connected_providers);
  const recentSources = normalizeValues(input.recent_processed_signal_sources);
  const processedSignalCount = clampCount(input.processed_signal_count);
  const recentSignalWindowDays = clampCount(input.recent_signal_window_days ?? DEFAULT_RECENT_SIGNAL_WINDOW_DAYS);

  const hasEmail = includesAny(recentSources, EMAIL_SOURCES);
  const hasCalendar = includesAny(recentSources, CALENDAR_SOURCES);
  const hasDocs = includesAny(recentSources, DOC_SOURCES);
  const hasChat = includesAny(recentSources, CHAT_SOURCES);
  const hasTasks = includesAny(recentSources, TASK_SOURCES);
  const hasObligationBase =
    hasEmail &&
    hasCalendar &&
    processedSignalCount >= MIN_USABLE_PROCESSED_SIGNALS;
  const hasOperatorContext = hasChat || hasTasks;
  const hasRichContext = hasDocs && hasOperatorContext;

  let sourceDepth: SourceDepth;
  if (!hasObligationBase) {
    sourceDepth = 'thin';
  } else if (hasRichContext) {
    sourceDepth = 'rich';
  } else {
    sourceDepth = 'usable';
  }

  let magicReadiness: MagicReadiness;
  if (sourceDepth === 'thin') {
    magicReadiness = 'not_ready';
  } else if (hasOperatorContext) {
    magicReadiness = 'operator_ready';
  } else if (hasDocs) {
    magicReadiness = 'context_ready';
  } else {
    magicReadiness = 'obligation_only';
  }

  const connector = nextBestConnector({
    connectedProviders,
    hasDocs,
    hasChat,
    hasTasks,
  });

  return {
    has_email: hasEmail,
    has_calendar: hasCalendar,
    has_docs: hasDocs,
    has_chat: hasChat,
    has_tasks: hasTasks,
    processed_signal_count: processedSignalCount,
    recent_signal_window_days: recentSignalWindowDays || DEFAULT_RECENT_SIGNAL_WINDOW_DAYS,
    source_depth: sourceDepth,
    magic_readiness: magicReadiness,
    next_best_connector: connector,
    reason:
      sourceDepth === 'thin'
        ? connectorReason(connector)
        : magicReadiness === 'obligation_only'
          ? 'Email and calendar are strong enough to support obligation-only Today reads.'
          : connectorReason(connector),
  };
}
