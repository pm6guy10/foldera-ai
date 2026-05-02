import { Bell, Mail, Search, TriangleAlert, TrendingUp } from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { DashboardSidebar } from '@/components/foldera/DashboardSidebar';
import { RightPanel } from '@/components/foldera/RightPanel';

const briefDraft = `Hi Alex —

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Jordan`;

export function DashboardPreview() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-x-6 -top-10 -bottom-6 -z-10">
        <div className="absolute left-1/3 top-0 h-64 w-64 rounded-full bg-brand-purple/10 blur-[120px]" />
        <div className="absolute right-1/4 bottom-0 h-72 w-72 rounded-full bg-accent/12 blur-[140px]" />
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border bg-panel/80 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2 border-b border-border/70 bg-panel px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </div>
          <div className="ml-3 flex-1 truncate text-center text-[11px] font-mono text-text-muted">
            app.foldera.ai / executive-briefing
          </div>
          <div className="w-12" />
        </div>

        <div className="grid min-h-[860px] lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_296px]">
          <DashboardSidebar activeLabel="Executive Briefing" userName="Jordan" preview />

          <main className="min-w-0 bg-[linear-gradient(180deg,rgba(7,10,15,0.74),rgba(4,7,11,0.84))]">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 px-8 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Saturday, September 13
                </div>
                <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
                  Good afternoon, Jordan.
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-[14px] border border-border bg-panel-raised px-3 py-2 text-[13px] text-text-muted md:flex">
                  <Search className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  <span>Search briefs, sources…</span>
                  <span className="ml-8 rounded border border-border-strong bg-panel px-1.5 py-px font-mono text-[10px] text-text-muted">
                    ⌘K
                  </span>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised text-text-muted"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-8 py-4">
              <div className="flex flex-wrap items-center gap-x-9 gap-y-2">
                <Stat icon={Mail} value="5" label="open threads" tone="text-accent" />
                <Stat icon={TriangleAlert} value="2" label="need attention" tone="text-warning" />
                <Stat icon={TrendingUp} value="1" label="ready to move" tone="text-success" />
              </div>
              <div className="text-[12px] text-text-muted">All sources connected · synced 2 min ago</div>
            </div>

            <div className="grid gap-6 px-8 py-7 xl:grid-cols-[minmax(0,1fr)]">
              <DailyBriefCard
                className="w-full"
                dashboardCta
                directive="Send the follow-up to Alex Morgan before noon."
                whyNow="You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today."
                draftLabel="FOLLOW-UP EMAIL"
                draftBody={<div className="whitespace-pre-line">{briefDraft}</div>}
                sourcePills={['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox']}
                nextStep="Next: Await response"
                statusText="READY TO SEND"
                footerText="Grounded in connected sources"
                actions={[
                  { label: 'Copy draft', kind: 'secondary' },
                  { label: 'Snooze 24h', kind: 'amber' },
                  { label: 'Approve', kind: 'primary' },
                ]}
              />
            </div>
          </main>

          <aside className="hidden border-l border-border/70 bg-[rgba(4,9,16,0.9)] p-6 xl:block">
            <RightPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Mail;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone}`} strokeWidth={1.75} aria-hidden />
      <span className="text-[16px] font-semibold text-text-primary tabular-nums">{value}</span>
      <span className="text-[13px] text-text-muted">{label}</span>
    </div>
  );
}
