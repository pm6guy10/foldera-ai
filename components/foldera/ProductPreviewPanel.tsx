import { Inbox, ShieldCheck, TriangleAlert, TrendingUp } from 'lucide-react';

const stats = [
  { label: 'Inbox', value: '5', note: 'Open threads', icon: Inbox, color: 'text-accent' },
  { label: 'Conflicts', value: '2', note: 'Need attention', icon: TriangleAlert, color: 'text-warning' },
  { label: 'Opportunities', value: '1', note: 'Ready to move', icon: TrendingUp, color: 'text-success' },
  { label: 'Approved', value: '12', note: 'Completed', icon: ShieldCheck, color: 'text-accent' },
];

const contextItems = [
  '3 open threads need replies',
  '2 time-bound tasks today',
  '1 calendar hold creates window',
  '7 signals scanned this morning',
];

export function ProductPreviewPanel() {
  return (
    <section className="foldera-panel p-6 sm:p-7">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.36fr)_minmax(0,0.64fr)] xl:items-start">
        <div className="max-w-sm">
          <p className="foldera-eyebrow text-accent">Product proof</p>
          <h2 className="mt-4 text-[38px] font-semibold leading-[1.02] tracking-[-0.05em] text-text-primary">
            See the workspace that turns signals into one finished move.
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-text-secondary">
            The live dashboard stays calm: one executive brief, source-backed context, and a single next step that is ready to use.
          </p>
          <div className="mt-6 space-y-3 text-sm text-text-muted">
            <p>5 open threads surfaced before they decay.</p>
            <p>2 time-bound conflicts flagged before they slip.</p>
            <p>1 ready-to-move opportunity promoted to the top.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="foldera-subpanel overflow-hidden">
            <div className="grid gap-4 border-b border-border px-5 py-5 md:grid-cols-2">
              <div>
                <p className="foldera-eyebrow">Executive snapshot</p>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div key={stat.label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                        <Icon className={`mt-1 h-4 w-4 ${stat.color}`} aria-hidden="true" />
                        <div>
                          <p className={`text-[28px] font-semibold tracking-[-0.05em] ${stat.color}`}>{stat.value}</p>
                          <p className="text-sm text-text-primary">{stat.label}</p>
                          <p className="text-xs text-text-muted">{stat.note}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="foldera-eyebrow">Context strip</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {contextItems.map((item) => (
                    <div key={item} className="rounded-[16px] border border-border bg-panel px-4 py-4">
                      <p className="text-[26px] font-semibold tracking-[-0.05em] text-text-primary">{item.split(' ')[0]}</p>
                      <p className="mt-2 text-xs leading-5 text-text-muted">{item.replace(/^\d+\s/, '')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
              <div className="rounded-[20px] border border-border bg-panel px-4 py-5">
                <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  <span>Daily Brief</span>
                  <span className="text-accent">Ready to send</span>
                </div>
                <p className="mt-4 text-[24px] font-semibold leading-8 tracking-[-0.05em] text-text-primary">
                  Send the follow-up to Alex Morgan before noon.
                </p>
                <button type="button" className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-[12px] bg-accent text-sm font-semibold text-slate-950">
                  Approve &amp; send
                </button>
              </div>

              <div className="rounded-[20px] border border-border bg-panel px-4 py-5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] border border-border bg-panel-raised">
                  <Inbox className="h-5 w-5 text-text-muted" />
                </div>
                <p className="mt-4 text-center text-lg font-medium text-text-primary">Your daily brief will appear here</p>
                <p className="mt-2 text-center text-sm leading-6 text-text-muted">
                  If nothing is worth shipping yet, Foldera waits instead of inventing busywork.
                </p>
                <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                  {stats.map((stat) => (
                    <div key={stat.label} className="rounded-[12px] border border-border bg-panel-raised px-2 py-3">
                      <p className="text-sm font-semibold text-text-primary">{stat.value}</p>
                      <p className="mt-1 text-[10px] text-text-muted">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
