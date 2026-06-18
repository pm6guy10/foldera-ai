import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  FileSearch,
  FileText,
  Inbox,
  Link2,
} from 'lucide-react';

const rows = [
  {
    icon: ClipboardList,
    title: 'Directive',
    desc: 'The single move that matters most right now.',
  },
  {
    icon: FileText,
    title: 'Draft',
    desc: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    icon: FileSearch,
    title: 'Source trail',
    desc: 'The evidence behind the recommendation.',
  },
];

type RightPanelProps = {
  stageDesktop?: boolean;
  learnMoreHref?: string;
  sourceTrailItems?: SourceTrailItem[];
};

export type SourceTrailItem = {
  label: string;
  detail: string;
  meta?: string;
};

function getSourceIcon(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('calendar')) return CalendarDays;
  if (normalized.includes('email') || normalized.includes('inbox')) return Inbox;
  if (normalized.includes('document') || normalized.includes('draft')) return FileText;
  if (normalized.includes('receipt') || normalized.includes('safety')) return CheckCircle2;
  return Link2;
}

export function RightPanel({
  stageDesktop = false,
  learnMoreHref = '/#product',
  sourceTrailItems = [],
}: RightPanelProps) {
  const hasSourceTrail = sourceTrailItems.length > 0;

  if (stageDesktop) {
    return (
      <div className="flex h-full flex-col gap-4">
        <div className="foldera-panel foldera-dashboard-right-rail-panel min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="foldera-eyebrow">{hasSourceTrail ? 'Source trail' : 'How this brief works'}</p>
            <a href={learnMoreHref} className="shrink-0 text-sm text-text-muted hover:text-text-primary">
              Learn more →
            </a>
          </div>
          {hasSourceTrail ? (
            <div className="mt-5" data-testid="dashboard-source-trail-panel">
              <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-white">
                Evidence behind today&apos;s move
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Foldera is showing the current trail it used before recommending this action.
              </p>
              <div className="mt-4 space-y-3">
                {sourceTrailItems.map((item) => {
                  const Icon = getSourceIcon(item.label);
                  return (
                    <div
                      key={`${item.label}-${item.detail}`}
                      className="rounded-[16px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.18)]"
                    >
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-accent-hover/15 bg-accent/[0.07] text-accent-hover">
                          <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                            {item.meta ? (
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                                {item.meta}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-text-muted">{item.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {rows.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised text-text-secondary">
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{title}</p>
                    <p className="mt-1.5 text-sm leading-7 text-text-muted">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="foldera-panel foldera-dashboard-right-rail-panel foldera-dashboard-upload-panel h-[140px] p-4"
          aria-disabled="true"
        >
          <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-border bg-panel-raised px-4 text-center">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
                <CloudUpload className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-medium leading-snug text-text-primary">
                Uploads coming later
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Use Sources for live evidence today.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="foldera-panel foldera-dashboard-right-rail-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="foldera-eyebrow">How this brief works</p>
          <a href={learnMoreHref} className="shrink-0 text-sm text-text-muted hover:text-text-primary">
            Learn more →
          </a>
        </div>
        <div className="mt-5 space-y-5">
          {rows.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised text-text-secondary">
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{title}</p>
                <p className="mt-2 text-sm leading-7 text-text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="foldera-panel foldera-dashboard-right-rail-panel p-5"
        aria-disabled="true"
      >
        <div className="flex min-h-[168px] items-center justify-center rounded-[20px] border border-dashed border-border bg-panel-raised px-5 text-center">
          <div>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
              <CloudUpload className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-base font-medium leading-snug text-text-primary">
              Uploads coming later
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              Use connected sources for live evidence today.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
