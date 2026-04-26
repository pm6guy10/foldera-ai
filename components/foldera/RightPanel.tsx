import { CloudUpload, FileSearch, FileText, ClipboardList } from 'lucide-react';

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
};

export function RightPanel({
  stageDesktop = false,
  learnMoreHref = '/#product',
}: RightPanelProps) {
  if (stageDesktop) {
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="foldera-panel foldera-dashboard-right-rail-panel min-h-0 flex-1 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="foldera-eyebrow">How this brief works</p>
            <a href={learnMoreHref} className="shrink-0 text-sm text-text-muted hover:text-text-primary">
              Learn more →
            </a>
          </div>
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
        </div>

        <div className="foldera-panel foldera-dashboard-right-rail-panel h-[200px] p-5">
          <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-border bg-panel-raised px-5 text-center">
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
                <CloudUpload className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-4 text-base font-medium leading-snug text-text-primary">
                Drop a folder or document.
              </p>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                Foldera will get to work instantly.
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

      <div className="foldera-panel foldera-dashboard-right-rail-panel p-5">
        <div className="flex min-h-[168px] items-center justify-center rounded-[20px] border border-dashed border-border bg-panel-raised px-5 text-center">
          <div>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
              <CloudUpload className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-4 text-base font-medium leading-snug text-text-primary">
              Drop a folder or document.
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              Foldera will get to work instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
