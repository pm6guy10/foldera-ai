'use client';

import type { ReactNode } from 'react';
import {
  CircleDot,
  Clock3,
  Copy,
  FileText,
  Layers3,
  Plane,
  Shield,
  type LucideIcon,
} from 'lucide-react';

type BriefAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  kind?: 'secondary' | 'amber' | 'primary';
  icon?: LucideIcon;
  disabled?: boolean;
  dataTestId?: string;
};

type DailyBriefCardProps = {
  directive: string;
  whyNow: string;
  draftLabel?: string;
  draftBody: ReactNode;
  sourcePills: string[];
  nextStep?: string;
  statusText?: string;
  footerText?: string;
  actions?: BriefAction[];
  className?: string;
  directiveIcon?: LucideIcon;
  whyIcon?: LucideIcon;
  draftIcon?: LucideIcon;
  sourceIcon?: LucideIcon;
  compact?: boolean;
  blur?: boolean;
  blurCta?: ReactNode;
};

function ActionButton({ action }: { action: BriefAction }) {
  const Icon = action.icon ?? (action.kind === 'primary' ? Plane : action.kind === 'amber' ? Clock3 : Copy);
  const sharedClassName =
    action.kind === 'primary'
      ? 'foldera-button-primary min-h-[52px] px-6 text-base'
      : action.kind === 'amber'
        ? 'foldera-button-amber'
        : 'foldera-button-secondary';

  if (action.href) {
    return (
      <a href={action.href} className={sharedClassName} data-testid={action.dataTestId}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {action.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={`${sharedClassName} disabled:cursor-not-allowed disabled:opacity-60`}
      data-testid={action.dataTestId}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {action.label}
    </button>
  );
}

export function DailyBriefCard({
  directive,
  whyNow,
  draftLabel = 'DRAFT',
  draftBody,
  sourcePills,
  nextStep = 'Next: Await response',
  statusText = 'READY TO SEND',
  footerText = 'Grounded in connected sources',
  actions = [],
  className = '',
  directiveIcon = Plane,
  whyIcon = Clock3,
  draftIcon = FileText,
  sourceIcon = Layers3,
  compact = false,
  blur = false,
  blurCta,
}: DailyBriefCardProps) {
  const DirectiveIcon = directiveIcon;
  const WhyIcon = whyIcon;
  const DraftIcon = draftIcon;
  const SourceIcon = sourceIcon;

  return (
    <article className={`foldera-brief-shell ${compact ? 'rounded-[22px]' : ''} ${className}`}>
      <div className={`${blur ? 'pointer-events-none select-none blur-[10px]' : ''}`}>
        <header className={`${compact ? 'px-4 py-4' : 'px-5 py-5 sm:px-6'} border-b border-white/8`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CircleDot className="h-4 w-4 text-accent" strokeWidth={2.4} aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-primary">Daily Brief</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{statusText}</span>
              <CircleDot className="h-4 w-4 text-accent" strokeWidth={2.4} aria-hidden="true" />
            </div>
          </div>
        </header>

        <div className={`${compact ? 'px-4 py-4' : 'px-5 py-6 sm:px-6 sm:py-6'} space-y-6`}>
          <section className={`${compact ? 'gap-4' : 'gap-5'} grid grid-cols-[auto_minmax(0,1fr)] items-start`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-cyan-400/20 bg-cyan-400/6 text-accent">
              <DirectiveIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Directive</p>
              <h2 className={`${compact ? 'mt-2 text-[24px] leading-[1.18]' : 'mt-2 text-[42px] leading-[1.14] sm:text-[48px]'} max-w-3xl font-semibold tracking-[-0.04em] text-text-primary`}>
                {directive}
              </h2>
            </div>
          </section>

          <section className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-5 border-t border-white/8 pt-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-amber-400/20 bg-amber-400/6 text-amber-400">
              <WhyIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">Why This Now</p>
              <p className="mt-2 max-w-3xl text-[15px] leading-8 text-text-secondary">{whyNow}</p>
            </div>
          </section>

          <section className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-5 border-t border-white/8 pt-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.02] text-text-secondary">
              <DraftIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{draftLabel}</p>
              <div className="mt-2 text-[15px] leading-8 text-text-primary">{draftBody}</div>
            </div>
          </section>

          <section className="border-t border-white/8 pt-5">
            <div className="flex items-center gap-3">
              <SourceIcon className="h-5 w-5 text-text-secondary" strokeWidth={2} aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Source Basis</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {sourcePills.map((pill) => (
                <span key={pill} className="rounded-[12px] border border-border bg-white/[0.015] px-3 py-2 text-[12px] text-text-secondary">
                  {pill}
                </span>
              ))}
            </div>
          </section>
        </div>

        <footer className={`${compact ? 'px-4 py-4' : 'px-5 py-5 sm:px-6'} border-t border-white/8`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-center gap-2 text-[13px] text-text-muted">
              <Shield className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <span>{footerText}</span>
            </div>
            {actions.length > 0 ? (
              <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center md:justify-end">
                {actions.map((action) => (
                  <ActionButton key={action.label} action={action} />
                ))}
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-right text-[12px] text-text-muted">{nextStep}</p>
        </footer>
      </div>

      {blur ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05080dcc]/70 px-6 backdrop-blur-sm">
          {blurCta}
        </div>
      ) : null}
    </article>
  );
}
