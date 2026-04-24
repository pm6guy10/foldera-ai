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
    <aside className="space-y-4 xl:sticky xl:top-24">
      <section className="foldera-panel p-4">
        <div className="flex items-center justify-between">
          <p className="foldera-eyebrow">Dashboard — Product views</p>
          <a href="/dashboard" className="text-sm text-accent">
            View full dashboard →
          </a>
        </div>
        <div className="mt-4 overflow-hidden rounded-[18px] border border-border">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 ${index !== 0 ? 'border-t border-border' : ''}`}
              >
                <Icon className={`h-4 w-4 ${stat.color}`} aria-hidden="true" />
                <div>
                  <p className="text-sm text-text-primary">{stat.label}</p>
                  <p className="text-xs text-text-muted">{stat.note}</p>
                </div>
                <span className={`text-[28px] font-semibold tracking-[-0.04em] ${stat.color}`}>{stat.value}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="foldera-panel p-4">
        <p className="foldera-eyebrow">Dashboard — Context strip (example)</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {contextItems.map((item) => (
            <div key={item} className="foldera-subpanel px-4 py-4">
              <p className="text-[24px] font-semibold tracking-[-0.04em] text-text-primary">{item.split(' ')[0]}</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">{item.replace(/^\d+\s/, '')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="foldera-panel p-4">
        <p className="foldera-eyebrow">Dashboard — Empty state</p>
        <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-[20px] border border-border bg-panel-raised px-6 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] border border-border bg-panel">
              <Inbox className="h-5 w-5 text-text-muted" />
            </div>
            <p className="mt-4 text-lg font-medium text-text-primary">Your daily brief will appear here</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              We&apos;re scanning your signals and will deliver your next finished move.
            </p>
          </div>
        </div>
      </section>

      <section className="foldera-panel p-4">
        <p className="foldera-eyebrow">Mobile preview</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-[22px] border border-border bg-[#090d12] p-3">
            <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              <span>Daily Brief</span>
              <span className="text-accent">Ready to send</span>
            </div>
            <p className="mt-4 text-[18px] font-semibold leading-6 tracking-[-0.04em] text-text-primary">
              Send the follow-up to Alex Morgan before noon.
            </p>
            <button type="button" className="mt-5 flex min-h-[42px] w-full items-center justify-center rounded-[12px] bg-accent text-sm font-semibold text-slate-950">
              Approve &amp; send
            </button>
          </div>
          <div className="overflow-hidden rounded-[22px] border border-border bg-[#090d12] p-3">
            <p className="text-[18px] font-semibold leading-6 tracking-[-0.04em] text-text-primary">
              Send the follow-up to Alex Morgan before noon.
            </p>
            <button type="button" className="mt-5 flex min-h-[42px] w-full items-center justify-center rounded-[12px] border border-border bg-panel text-sm text-text-secondary">
              Snooze 24h
            </button>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-[12px] border border-border bg-panel px-2 py-3">
                  <p className="text-sm font-semibold text-text-primary">{stat.value}</p>
                  <p className="mt-1 text-[10px] text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}
