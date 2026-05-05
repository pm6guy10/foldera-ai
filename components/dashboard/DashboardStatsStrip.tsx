import type { LucideIcon } from 'lucide-react';

type DashboardStat = {
  icon: LucideIcon;
  value: number;
  label: string;
  valueClassName: string;
};

type DashboardStatsStripProps = {
  stats: DashboardStat[];
  variant: 'stage' | 'mobile';
};

export function DashboardStatsStrip({ stats, variant }: DashboardStatsStripProps) {
  if (variant === 'stage') {
    return (
      <div
        className="absolute flex items-center justify-between text-[28px] text-text-secondary"
        data-testid="dashboard-truth-stats"
        style={{ left: 400, top: 176, width: 900, height: 44 }}
      >
        {stats.map(({ icon: Icon, value, label, valueClassName }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-text-muted" aria-hidden />
            <span className={`text-[36px] font-semibold tracking-[-0.045em] ${valueClassName}`}>
              {value}
            </span>
            <span className="text-[32px] font-normal">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm text-text-secondary"
      data-testid="dashboard-truth-stats"
    >
      {stats.map(({ icon: Icon, value, label, valueClassName }) => (
        <div key={label} className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-text-muted" aria-hidden />
          <span className={`text-[28px] font-semibold tracking-[-0.04em] sm:text-[32px] ${valueClassName}`}>
            {value}
          </span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
