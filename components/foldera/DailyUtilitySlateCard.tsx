'use client';

import type { DailyUtilitySlateItem } from '@/lib/briefing/daily-utility-slate';
import type { DashboardDailyValueState } from '@/app/dashboard/dashboard-page-model';
import { CircleSlash2, Copy, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';

type DailyUtilitySlateCardPayload = {
  primary_move?: DailyUtilitySlateItem | null;
  open_loops?: DailyUtilitySlateItem[];
  changed_since_yesterday?: DailyUtilitySlateItem[];
  blocked_but_real?: DailyUtilitySlateItem | null;
  watch_item?: DailyUtilitySlateItem | null;
};

type SlateEntry = {
  item: DailyUtilitySlateItem;
  sectionLabel: string;
  key: string;
};

type MissingInputPrompt = {
  heading: string;
  prompt: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

const SECTION_LABELS = {
  primary_move: 'Primary move',
  open_loops: 'Open loops',
  changed_since_yesterday: 'Changed since yesterday',
  blocked_but_real: 'Possible issue',
  watch_item: 'Watch item',
} as const;
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

function SlateItemCard({
  item,
  sectionLabel,
}: {
  item: DailyUtilitySlateItem;
  sectionLabel: string;
}) {
  return (
    <article
      className="border-l border-cyan-300/35 bg-white/[0.025] px-5 py-4"
      data-testid="dashboard-slate-item"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-cyan-300/20 bg-cyan-300/8 text-accent">
          <ListChecks className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {sectionLabel}
          </p>
          <h3 className="mt-1.5 text-[18px] font-semibold leading-6 text-text-primary">
            {item.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{item.why_it_matters}</p>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Evidence
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-text-secondary">
          {item.evidence.slice(0, 7).map((entry) => (
            <li key={evidenceKey(item, entry)} className="flex gap-2">
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
      </div>
      {item.next_action ? (
        <p className="mt-4 text-sm leading-6 text-text-primary">
          <span className="font-semibold">Safe next action:</span> {item.next_action}
        </p>
      ) : item.no_action_reason ? (
        <p className="mt-4 text-sm leading-6 text-amber-200">
          <span className="font-semibold">Why it stopped:</span> {friendlyStopReason(item.no_action_reason)}
        </p>
      ) : null}
    </article>
  );
}

export function DailyUtilitySlateCard({
  slate,
  missingInputPrompt,
  dailyValueState,
  onCopyDailyValue,
}: {
  slate: DailyUtilitySlateCardPayload;
  missingInputPrompt?: MissingInputPrompt | null;
  dailyValueState: DashboardDailyValueState;
  onCopyDailyValue?: () => void;
}) {
  const openLoops = slate.open_loops ?? [];
  const changedSinceYesterday = slate.changed_since_yesterday ?? [];
  const items: SlateEntry[] = [];
  if (slate.primary_move) {
    items.push({
      item: slate.primary_move,
      sectionLabel: SECTION_LABELS.primary_move,
      key: 'primary',
    });
  }
  items.push(
    ...openLoops.map((item) => ({
      item,
      sectionLabel: SECTION_LABELS.open_loops,
      key: `open:${item.title}`,
    })),
    ...changedSinceYesterday.map((item) => ({
      item,
      sectionLabel: SECTION_LABELS.changed_since_yesterday,
      key: `changed:${item.title}`,
    })),
  );
  if (slate.blocked_but_real) {
    items.push({
      item: slate.blocked_but_real,
      sectionLabel: SECTION_LABELS.blocked_but_real,
      key: 'blocked',
    });
  }
  if (slate.watch_item) {
    items.push({
      item: slate.watch_item,
      sectionLabel: SECTION_LABELS.watch_item,
      key: 'watch',
    });
  }
  const hasPrimaryMove = Boolean(slate.primary_move);
  const canCopy = Boolean(dailyValueState.copyText && onCopyDailyValue);

  return (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell h-full w-full overflow-y-auto px-5 py-5 sm:px-7 sm:py-6"
      data-testid="dashboard-daily-utility-slate"
    >
      <div className="mx-auto grid min-h-full w-full max-w-[1060px] gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.78fr)] xl:items-start">
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {missingInputPrompt?.heading ?? 'Today'}
          </div>
          <h2 className="mt-4 max-w-[700px] text-[30px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[38px] lg:text-[42px]">
            {dailyValueState.heading}
          </h2>
          <p className="mt-4 inline-flex rounded-full border border-amber-300/20 bg-amber-300/8 px-3 py-1.5 text-sm font-semibold text-amber-200">
            {dailyValueState.statusLabel}
          </p>
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

          <div className="mt-6 grid gap-3 text-sm text-text-secondary lg:max-w-[700px]">
            {dailyValueState.valueBlocks.map((block) => (
              <article key={block.label} className="rounded-[14px] border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    {block.label}
                  </p>
                </div>
                <p className="mt-2 leading-6 text-text-primary">{block.body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-amber-300/25 bg-amber-300/8 text-amber-200">
              {hasPrimaryMove ? (
                <ListChecks className="h-5 w-5" aria-hidden />
              ) : (
                <CircleSlash2 className="h-5 w-5" aria-hidden />
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Source trail
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {hasPrimaryMove
                  ? 'Evidence behind this move.'
                  : 'The visible evidence explains why Foldera held back.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {items.map(({ item, sectionLabel, key }) => (
              <SlateItemCard key={key} item={item} sectionLabel={sectionLabel} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
