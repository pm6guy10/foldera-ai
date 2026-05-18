'use client';

import type { DailyUtilitySlateItem } from '@/lib/briefing/daily-utility-slate';
import type { DashboardDailyValueState } from '@/app/dashboard/dashboard-page-model';
import { Copy, ShieldCheck } from 'lucide-react';

type DailyUtilitySlateCardPayload = {
  primary_move?: DailyUtilitySlateItem | null;
  open_loops?: DailyUtilitySlateItem[];
  changed_since_yesterday?: DailyUtilitySlateItem[];
  blocked_but_real?: DailyUtilitySlateItem | null;
  watch_item?: DailyUtilitySlateItem | null;
};

type MissingInputPrompt = {
  heading: string;
  prompt: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

const RAW_WEAK_PRESSURE_REASON = ['NO', 'REAL', 'PRESSURE'].join(' ');

function evidenceKey(item: DailyUtilitySlateItem, entry: string): string {
  return `${item.status}:${item.title}:${entry}`;
}

function friendlySlateText(value: string, fallback: string): string {
  const rawWeakPressurePattern = new RegExp(`\\b${RAW_WEAK_PRESSURE_REASON}\\b`, 'i');
  if (rawWeakPressurePattern.test(value)) {
    return value.replace(
      new RegExp(`\\b(?:Why Foldera stopped:\\s*)?${RAW_WEAK_PRESSURE_REASON}\\b`, 'gi'),
      'The current source trail does not show enough real pressure for finished work.',
    );
  }
  if (/\bmissing_[a-z0-9_]+\b|\bweak_[a-z0-9_]+\b|\bstale_[a-z0-9_]+\b|\b[a-z]+_[a-z0-9_]+_[a-z0-9_]+\b/i.test(value)) {
    return fallback;
  }
  return value;
}

function friendlyStopReason(reason: string): string {
  const normalized = reason.replace(/[_-]+/g, ' ').toLowerCase();
  if (normalized.includes(RAW_WEAK_PRESSURE_REASON.toLowerCase())) {
    return 'The current source trail does not show enough real pressure for finished work.';
  }
  if (/\bstale\b|\bfresher\b|\bcurrent artifact facts\b/.test(normalized)) {
    return 'Foldera needs fresher source data before it can finish this safely.';
  }
  if (/\brecipient\b|\bwho should\b/.test(normalized)) {
    return 'Foldera needs a grounded recipient before it can finish a safe message.';
  }
  if (/\bsource\b|\banchor\b|\btoo thin\b/.test(normalized)) {
    return 'Foldera needs a current source anchor before turning this into finished work.';
  }
  if (/\bconsequence\b|\boutcome\b|\bnext action\b|\brisk\b/.test(normalized)) {
    return 'Foldera needs one concrete consequence or desired outcome first.';
  }
  return friendlySlateText(reason, 'Foldera held back because the evidence was not strong enough yet.');
}

export function DailyUtilitySlateCard({
  slate,
  dailyValueState,
  onCopyDailyValue,
}: {
  slate: DailyUtilitySlateCardPayload;
  missingInputPrompt?: MissingInputPrompt | null;
  dailyValueState: DashboardDailyValueState;
  onCopyDailyValue?: () => void;
}) {
  const firstSlateItem =
    slate.primary_move ??
    slate.open_loops?.[0] ??
    slate.changed_since_yesterday?.[0] ??
    slate.blocked_but_real ??
    slate.watch_item ??
    null;
  const headline = dailyValueState.statusLabel || dailyValueState.heading;
  const canCopy = Boolean(dailyValueState.copyText && onCopyDailyValue);

  return (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full items-start justify-center overflow-y-auto px-5 py-5 sm:px-7 sm:py-6"
      data-testid="dashboard-daily-utility-slate"
    >
      <section className="mx-auto w-full max-w-[760px] rounded-[20px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Foldera already checked your connected sources
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Today&apos;s answer
        </p>
        <h2 className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[42px]">
          {headline}
        </h2>
        <p className="mt-4 max-w-[620px] text-[16px] leading-7 text-text-secondary sm:text-[17px] sm:leading-7">
          {dailyValueState.summary}
        </p>
        {dailyValueState.actionHref && dailyValueState.actionLabel ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={dailyValueState.actionHref} className="foldera-button-secondary">
              {dailyValueState.actionLabel}
            </a>
            {canCopy ? (
              <button
                type="button"
                className="foldera-button-primary"
                onClick={onCopyDailyValue}
                data-testid="dashboard-daily-value-copy"
              >
                <Copy className="h-4 w-4" aria-hidden />
                {dailyValueState.copyLabel ?? 'Copy read'}
              </button>
            ) : null}
          </div>
        ) : canCopy ? (
          <div className="mt-5">
            <button
              type="button"
              className="foldera-button-primary"
              onClick={onCopyDailyValue}
              data-testid="dashboard-daily-value-copy"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {dailyValueState.copyLabel ?? 'Copy read'}
            </button>
          </div>
        ) : null}

        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Source trail
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Nothing was sent. This is the visible proof behind the answer.
          </p>
          {firstSlateItem ? (
            <>
              <p className="mt-3 text-sm font-semibold text-text-primary">{firstSlateItem.title}</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-text-secondary">
                {firstSlateItem.evidence.slice(0, 4).map((entry) => (
                  <li key={evidenceKey(firstSlateItem, entry)} className="flex gap-2">
                    <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
                    <span>
                      {friendlySlateText(
                        entry,
                        'Foldera checked this receipt and held back before producing finished work.',
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {firstSlateItem.next_action ? (
                <p className="mt-3 text-sm leading-6 text-text-primary">
                  <span className="font-semibold">Next move:</span> {firstSlateItem.next_action}
                </p>
              ) : firstSlateItem.no_action_reason ? (
                <p className="mt-3 text-sm leading-6 text-amber-200">
                  <span className="font-semibold">Why Foldera held back:</span>{' '}
                  {friendlyStopReason(firstSlateItem.no_action_reason)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              Foldera is waiting for enough fresh source proof before giving a trusted answer.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
