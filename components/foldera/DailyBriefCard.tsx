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
  className?: string;
};

function ActionButton({
  action,
  dashboardCta,
  stageDesktop = false,
}: {
  action: BriefAction;
  dashboardCta: boolean;
  stageDesktop?: boolean;
}) {
  if (action.kind === 'primary') {
    if (dashboardCta) {
      const footerPrimaryClass =
        (stageDesktop
          ? 'foldera-dashboard-stage-approve-btn'
          : 'foldera-dashboard-approve-btn w-full sm:w-auto sm:shrink-0 lg:w-auto') + (action.className ? ` ${action.className}` : '');
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
      : 'foldera-button-secondary') + dashboardFoot + (action.className ? ` ${action.className}` : '');

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
  /** Fixed-layout desktop stage variant for pixel-match dashboard mode. */
  stageDesktop?: boolean;
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
  stageDesktop = false,
}: DailyBriefCardProps) {
  const DirectiveIcon = directiveIcon;
  const WhyIcon = whyIcon;
  const DraftIcon = draftIcon;
  const SourceIcon = sourceIcon;

  const primaryAction = actions.find((a) => a.kind === 'primary');
  const otherActions = actions.filter((a) => a.kind !== 'primary');
  const divider = dashboardCta ? 'border-white/[0.028]' : 'border-white/8';
  const headPad = compact ? 'px-4 py-4' : dashboardCta ? 'px-6 py-5 sm:px-7' : 'px-5 py-5 sm:px-6';
  const bodyPad = compact ? 'px-4 py-4' : dashboardCta ? 'px-6 py-7 sm:px-7 sm:py-8' : 'px-5 py-6 sm:px-6 sm:py-6';
  const bodyStack = compact ? 'space-y-4' : dashboardCta ? 'space-y-7' : 'space-y-6';
  const sectionTop = compact ? 'pt-4' : dashboardCta ? 'pt-6' : 'pt-5';
  const sectionGap = compact ? 'gap-4' : dashboardCta ? 'gap-6' : 'gap-5';
  const footPad = compact ? 'px-4 py-4' : dashboardCta ? 'px-6 py-5 sm:px-7' : 'px-5 py-5 sm:px-6';

  if (stageDesktop && dashboardCta) {
    return (
      <article className={`foldera-brief-shell relative h-full w-full rounded-[26px] ${className}`}>
        <header className="absolute inset-x-0 top-0 h-[76px] border-b border-white/8 px-[42px]">
          <div className="flex h-full items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CircleDot className="h-4 w-4 text-accent" strokeWidth={2.4} aria-hidden="true" />
              <span className="text-[22px] font-semibold uppercase tracking-[0.18em] text-text-primary">Daily Brief</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[22px] font-semibold uppercase tracking-[0.16em] text-accent">{statusText}</span>
              <CircleDot className="h-4 w-4 text-accent" strokeWidth={2.4} aria-hidden="true" />
            </div>
          </div>
        </header>

        <div className="absolute left-[55px] top-[252px] h-px w-[1106px] bg-white/8" />
        <div className="absolute left-[55px] top-[430px] h-px w-[1106px] bg-white/8" />
        <div className="absolute left-[55px] top-[688px] h-px w-[1106px] bg-white/8" />
        <div className="absolute left-[40px] top-[742px] h-px w-[1136px] bg-white/8" />

        <div className="absolute left-[104px] top-[122px] flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 text-accent">
          <DirectiveIcon className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="absolute left-[242px] right-[55px] top-[100px]">
          <p className="text-[18px] font-semibold uppercase tracking-[0.16em] text-amber-400">Directive</p>
          <h2 className="mt-3 max-w-[620px] text-[42px] font-semibold leading-[50px] tracking-[-0.035em] text-text-primary">
            {directive}
          </h2>
        </div>

        <div className="absolute left-[104px] top-[274px] flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border border-amber-400/30 bg-amber-400/8 text-amber-400">
          <WhyIcon className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="absolute left-[242px] right-[55px] top-[252px]">
          <p className="text-[18px] font-semibold uppercase tracking-[0.16em] text-amber-400">Why This Now</p>
          <p className="mt-3 max-w-[650px] text-[20px] leading-[32px] text-text-secondary">{whyNow}</p>
        </div>

        <div className="absolute left-[104px] top-[452px] flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border border-white/12 bg-white/[0.03] text-text-secondary">
          <DraftIcon className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="absolute left-[242px] right-[55px] top-[430px]">
          <p className="text-[18px] font-semibold uppercase tracking-[0.16em] text-text-muted">{draftLabel}</p>
          <div className="mt-3 max-w-[650px] text-[20px] leading-[32px] text-text-primary">{draftBody}</div>
        </div>

        <div className="absolute left-[104px] top-[692px] flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-white/12 bg-white/[0.03] text-text-secondary">
          <SourceIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </div>
        <p className="absolute left-[242px] top-[690px] text-[18px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Source Basis
        </p>
        <div className="absolute left-[440px] right-[55px] top-[688px] flex flex-wrap gap-3">
          {sourcePills.map((pill) => (
            <span
              key={pill}
              className="inline-flex h-[42px] items-center rounded-[12px] border border-border bg-white/[0.03] px-4 text-[17px] text-text-secondary"
            >
              {pill}
            </span>
          ))}
        </div>

        <footer className="absolute inset-x-0 top-[742px] h-[108px]">
          <div className="absolute left-[40px] top-[48px] flex items-center gap-2.5 text-[18px] text-text-muted">
            <Shield className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
            <span>{footerText}</span>
          </div>
          <div className="absolute right-[40px] top-[46px] flex items-start gap-4">
            {otherActions.map((action) => {
              const stageClass = action.kind === 'amber' ? 'w-[210px] h-[58px]' : 'w-[190px] h-[58px]';
              return (
                <ActionButton
                  key={action.label}
                  action={{ ...action, className: `foldera-dashboard-stage-foot-btn ${stageClass}` }}
                  dashboardCta
                  stageDesktop
                />
              );
            })}
            {primaryAction ? (
              <div className="flex w-[275px] flex-col items-center">
                <ActionButton
                  action={{ ...primaryAction, className: 'h-[62px] w-[275px] whitespace-nowrap' }}
                  dashboardCta
                  stageDesktop
                />
                <p className="mt-2 w-full text-center text-[14px] leading-tight text-text-muted">{nextStep}</p>
              </div>
            ) : null}
          </div>
        </footer>
      </article>
    );
  }

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
              } ${dashboardCta ? 'max-w-[18.5ch]' : 'max-w-3xl'} font-semibold tracking-[-0.04em] text-text-primary`}
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
                  dashboardCta ? 'rounded-[10px]' : 'rounded-[12px]'
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-text-muted">
                <Shield className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <span className="min-w-0 leading-snug">{footerText}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-4 lg:flex-nowrap lg:gap-[18px]">
                {otherActions.map((action) => (
                  <ActionButton key={action.label} action={action} dashboardCta />
                ))}
                {primaryAction ? (
                  <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:shrink-0 sm:items-end">
                    <ActionButton action={primaryAction} dashboardCta />
                    <p className="w-full text-center text-[12px] leading-tight text-text-muted sm:text-right">{nextStep}</p>
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
