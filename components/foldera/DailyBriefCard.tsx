'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  CircleDot,
  Clock3,
  Copy,
  FileText,
  Layers3,
  Plane,
  Shield,
  Zap,
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

function ActionButton({ action, dashboardCta }: { action: BriefAction; dashboardCta: boolean }) {
  if (action.kind === 'primary') {
    if (dashboardCta) {
      const footerPrimaryClass =
        'foldera-dashboard-approve-btn w-full sm:w-auto sm:shrink-0 lg:w-auto';
      if (action.href) {
        return (
          <a href={action.href} className={footerPrimaryClass} data-testid={action.dataTestId}>
            <Zap className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} aria-hidden="true" />
            {action.label}
            <ArrowRight className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} aria-hidden="true" />
          </a>
        );
      }
      return (
        <button
          type="button"
          onClick={action.onClick}
          disabled={Boolean(action.disabled)}
          className={footerPrimaryClass}
          data-testid={action.dataTestId}
        >
          <Zap className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} aria-hidden="true" />
          {action.label}
          <ArrowRight className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} aria-hidden="true" />
        </button>
      );
    }

    const Icon = action.icon ?? Plane;
    const marketingPrimary = 'foldera-button-primary min-h-[48px] px-5 text-sm';
    if (action.href) {
      return (
        <a href={action.href} className={`${marketingPrimary} inline-flex items-center justify-center gap-2`} data-testid={action.dataTestId}>
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
        className={`${marketingPrimary} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60`}
        data-testid={action.dataTestId}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {action.label}
      </button>
    );
  }

  const Icon = action.icon ?? (action.kind === 'amber' ? Clock3 : Copy);
  const dashboardFoot =
    dashboardCta ? ' shrink-0 whitespace-nowrap' : '';
  const sharedClassName =
    (action.kind === 'amber'
      ? 'foldera-button-amber'
      : 'foldera-button-secondary') + dashboardFoot;

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
      disabled={Boolean(action.disabled)}
      className={`${sharedClassName} disabled:cursor-not-allowed disabled:opacity-60`}
      data-testid={action.dataTestId}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {action.label}
    </button>
  );
}

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
  /** Dashboard route uses Figma CTA (gradient + icons). Marketing preview keeps the default shell. */
  dashboardCta?: boolean;
};

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
  dashboardCta = false,
}: DailyBriefCardProps) {
  const DirectiveIcon = directiveIcon;
  const WhyIcon = whyIcon;
  const DraftIcon = draftIcon;
  const SourceIcon = sourceIcon;

  const primaryAction = actions.find((a) => a.kind === 'primary');
  const otherActions = actions.filter((a) => a.kind !== 'primary');
  const divider = dashboardCta ? 'border-white/[0.04]' : 'border-white/8';
  const headPad = compact ? 'px-4 py-4' : 'px-5 py-5 sm:px-6';
  const bodyPad = compact ? 'px-4 py-4' : 'px-5 py-6 sm:px-6 sm:py-6';
  const bodyStack = compact ? 'space-y-4' : 'space-y-6';
  const sectionTop = compact ? 'pt-4' : 'pt-5';
  const sectionGap = compact ? 'gap-4' : 'gap-5';
  const footPad = compact ? 'px-4 py-4' : 'px-5 py-5 sm:px-6';

  return (
    <article className={`foldera-brief-shell ${compact ? 'rounded-[22px]' : ''} ${className}`}>
      <header className={`${headPad} border-b ${divider}`}>
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

      <div className={`${bodyPad} ${bodyStack}`}>
        <section className={`${compact ? 'gap-4' : sectionGap} grid grid-cols-[auto_minmax(0,1fr)] items-start`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-cyan-400/20 bg-cyan-400/6 text-accent">
            <DirectiveIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${dashboardCta ? 'text-amber-400' : 'text-text-muted'}`}
            >
              Directive
            </p>
            <h2
              className={`${
                compact
                  ? 'mt-2 text-[24px] leading-[1.18]'
                  : dashboardCta
                    ? 'mt-1.5 text-[32px] leading-[1.12] sm:text-[38px]'
                    : 'mt-2 text-[42px] leading-[1.14] sm:text-[48px]'
              } max-w-3xl font-semibold tracking-[-0.04em] text-text-primary`}
            >
              {directive}
            </h2>
          </div>
        </section>

        <section className={`grid grid-cols-[auto_minmax(0,1fr)] items-start ${sectionGap} border-t ${divider} ${sectionTop}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-amber-400/20 bg-amber-400/6 text-amber-400">
            <WhyIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400">Why This Now</p>
            <p className={`mt-2 max-w-3xl text-[15px] text-text-secondary ${dashboardCta ? 'leading-7' : 'leading-8'}`}>{whyNow}</p>
          </div>
        </section>

        <section className={`grid grid-cols-[auto_minmax(0,1fr)] items-start ${sectionGap} border-t ${divider} ${sectionTop}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.02] text-text-secondary">
            <DraftIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{draftLabel}</p>
            <div className={`mt-2 text-[15px] text-text-primary ${dashboardCta ? 'leading-7' : 'leading-8'}`}>{draftBody}</div>
          </div>
        </section>

        <section className={`border-t ${divider} ${sectionTop}`}>
          <div className="flex items-center gap-3">
            <SourceIcon className="h-5 w-5 text-text-secondary" strokeWidth={2} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Source Basis</p>
          </div>
          <div className={`flex flex-wrap gap-2 ${dashboardCta ? 'mt-3' : 'mt-4'}`}>
            {sourcePills.map((pill) => (
              <span
                key={pill}
                className={`border border-border bg-white/[0.02] px-3 py-1.5 text-[12px] text-text-secondary ${
                  dashboardCta ? 'rounded-full' : 'rounded-[12px]'
                }`}
              >
                {pill}
              </span>
            ))}
          </div>
        </section>
      </div>

      <footer className={`${footPad} border-t ${divider}`}>
        {dashboardCta ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
              <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-text-muted lg:pt-0.5">
                <Shield className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <span className="min-w-0 leading-snug">{footerText}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-4 sm:gap-y-2 lg:flex-nowrap lg:gap-x-5">
                {otherActions.map((action) => (
                  <ActionButton key={action.label} action={action} dashboardCta />
                ))}
                {primaryAction ? (
                  <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:shrink-0">
                    <ActionButton action={primaryAction} dashboardCta />
                    <p className="w-full text-center text-[12px] leading-tight text-text-muted sm:max-w-none">{nextStep}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-center gap-2 text-[13px] text-text-muted">
                <Shield className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <span>{footerText}</span>
              </div>
              {actions.length > 0 ? (
                <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center md:justify-end">
                  {actions.map((action) => (
                    <ActionButton key={action.label} action={action} dashboardCta={false} />
                  ))}
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-right text-[12px] text-text-muted">{nextStep}</p>
          </>
        )}
      </footer>
    </article>
  );
}
