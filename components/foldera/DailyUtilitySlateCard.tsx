import type { DailyUtilitySlateItem } from '@/lib/briefing/daily-utility-slate';
import { CircleSlash2, ListChecks, ShieldCheck } from 'lucide-react';

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

const SECTION_LABELS = {
  primary_move: 'Primary move',
  open_loops: 'Open loops',
  changed_since_yesterday: 'Changed since yesterday',
  blocked_but_real: 'Possible issue',
  watch_item: 'Watch item',
} as const;

function evidenceKey(item: DailyUtilitySlateItem, entry: string): string {
  return `${item.status}:${item.title}:${entry}`;
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
          {item.evidence.slice(0, 4).map((entry) => (
            <li key={evidenceKey(item, entry)} className="flex gap-2">
              <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
              <span>{entry}</span>
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
          <span className="font-semibold">Why it stopped:</span> {item.no_action_reason}
        </p>
      ) : null}
    </article>
  );
}

export function DailyUtilitySlateCard({ slate }: { slate: DailyUtilitySlateCardPayload }) {
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

  return (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell h-full w-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
      data-testid="dashboard-daily-utility-slate"
    >
      <div className="mx-auto grid min-h-full w-full max-w-[1060px] gap-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.78fr)] lg:items-center">
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Today&apos;s read
          </div>
          <h2 className="mt-5 max-w-[700px] text-[34px] font-semibold leading-[1.02] tracking-[-0.02em] text-text-primary sm:text-[46px] lg:text-[54px]">
            No safe finished action today.
          </h2>
          <p className="mt-5 max-w-[620px] text-[16px] leading-7 text-text-secondary sm:text-[17px] sm:leading-8">
            Foldera did not find a piece of finished work it can stand behind. This is the
            safest useful read from the source trail, not a task to blindly execute.
          </p>

          <div className="mt-8 grid gap-3 text-sm text-text-secondary sm:grid-cols-3 lg:max-w-[660px]">
            <div className="border-t border-white/10 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Outcome
              </p>
              <p className="mt-1.5 text-text-primary">No artifact</p>
            </div>
            <div className="border-t border-white/10 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Guardrail
              </p>
              <p className="mt-1.5 text-text-primary">Safe stop</p>
            </div>
            <div className="border-t border-white/10 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Action
              </p>
              <p className="mt-1.5 text-text-primary">Do not send</p>
            </div>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-amber-300/25 bg-amber-300/8 text-amber-200">
              <CircleSlash2 className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Source trail
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                The current receipt explains why Foldera stopped.
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
