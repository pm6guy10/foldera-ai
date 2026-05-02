import { Clock3, Send, Zap } from 'lucide-react';

type MobilePreviewProps = {
  className?: string;
};

export function MobilePreview({ className = '' }: MobilePreviewProps) {
  return (
    <div className={`relative mx-auto w-full max-w-[292px] ${className}`}>
      <div className="pointer-events-none absolute -inset-10 -z-10">
        <div className="absolute inset-0 rounded-full bg-accent/10 blur-[88px]" />
      </div>

      <div className="overflow-hidden rounded-[30px] border border-border-strong bg-panel p-1.5 shadow-[0_30px_70px_-34px_rgba(0,0,0,0.88)]">
        <div className="overflow-hidden rounded-[24px] border border-border bg-bg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-primary/85">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
              Daily Brief
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Ready
            </span>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="flex items-start gap-2.5">
              <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Directive
                </p>
                <h3 className="mt-1 text-[14px] font-semibold leading-snug text-text-primary">
                  Send the follow-up to Alex Morgan before noon.
                </h3>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" strokeWidth={1.8} aria-hidden />
              <p className="text-[11.5px] leading-relaxed text-text-secondary">
                Open thread, time-bound ask, and a clean calendar window make this the move.
              </p>
            </div>

            <div className="rounded-[16px] border border-border bg-panel-raised px-3.5 py-3 text-[12.5px] leading-6 text-text-primary">
              <p>Hi Alex —</p>
              <p className="mt-2">
                I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['Email thread', 'Calendar hold', 'Connected inbox'].map((pill) => (
                <span key={pill} className="rounded-full border border-border bg-panel px-2.5 py-1 text-[10.5px] text-text-secondary">
                  {pill}
                </span>
              ))}
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-cyan-300/25 bg-accent px-3 py-2.5 text-[12.5px] font-semibold text-slate-950 shadow-[0_8px_24px_-10px_rgba(14,165,233,0.55)]"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              Approve
            </button>
            <button
              type="button"
              className="w-full rounded-[12px] border border-border bg-panel px-3 py-2.5 text-[12.5px] font-medium text-text-primary/85"
            >
              Snooze 24h
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
