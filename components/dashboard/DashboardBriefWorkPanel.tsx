import { ArrowUpRight, FileText, Layers3, Plane } from 'lucide-react';

const BRIEF_WORK_ROWS = [
  {
    icon: Plane,
    label: 'Directive',
    description: 'The single move that matters most right now.',
  },
  {
    icon: FileText,
    label: 'Draft',
    description: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    icon: Layers3,
    label: 'Source trail',
    description: 'The evidence behind the recommendation.',
  },
];

export function DashboardBriefWorkPanel() {
  return (
    <aside
      className="absolute hidden w-[348px] text-text-secondary min-[1440px]:block"
      data-testid="dashboard-brief-work-panel"
      style={{ left: 1650, top: 326 }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          How this brief works
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-text-muted">
          Learn more
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-5 divide-y divide-white/8 border-t border-white/8">
        {BRIEF_WORK_ROWS.map(({ icon: Icon, label, description }) => (
          <div key={label} className="grid grid-cols-[38px_92px_minmax(0,1fr)] gap-5 py-7">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03]">
              <Icon className="h-5 w-5 text-text-muted" strokeWidth={1.8} aria-hidden />
            </div>
            <p className="text-[16px] font-semibold text-text-secondary">{label}</p>
            <p className="text-[15px] leading-6 text-text-muted">{description}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
