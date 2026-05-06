import type { DailyUtilitySlateItem } from '@/lib/briefing/daily-utility-slate';

type DailyUtilitySlateCardPayload = {
  primary_move?: DailyUtilitySlateItem | null;
  open_loops?: DailyUtilitySlateItem[];
  changed_since_yesterday?: DailyUtilitySlateItem[];
  blocked_but_real?: DailyUtilitySlateItem | null;
  watch_item?: DailyUtilitySlateItem | null;
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
    <article className="rounded-[8px] border border-border bg-panel-raised/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {sectionLabel}
      </p>
      <h3 className="mt-2 text-[18px] font-semibold leading-6 text-text-primary">
        {item.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{item.why_it_matters}</p>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Evidence
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-text-secondary">
          {item.evidence.slice(0, 4).map((entry) => (
            <li key={evidenceKey(item, entry)}>{entry}</li>
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

  return (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell h-full w-full overflow-y-auto px-6 py-6 sm:px-8 sm:py-8"
      data-testid="dashboard-daily-utility-slate"
    >
      <div className="mx-auto flex h-full max-w-[820px] flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Today&apos;s read
        </p>
        <h2 className="mt-3 text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[36px]">
          No safe finished action today.
        </h2>
        <p className="mt-3 max-w-[680px] text-[15px] leading-7 text-text-secondary">
          Foldera did not find a piece of finished work it can stand behind. This is the
          safest useful read from the source trail, not a task to blindly execute.
        </p>

        <div className="mt-6 grid gap-4">
          {slate.primary_move ? (
            <SlateItemCard item={slate.primary_move} sectionLabel={SECTION_LABELS.primary_move} />
          ) : null}
          {openLoops.map((item) => (
            <SlateItemCard
              key={`open:${item.title}`}
              item={item}
              sectionLabel={SECTION_LABELS.open_loops}
            />
          ))}
          {changedSinceYesterday.map((item) => (
            <SlateItemCard
              key={`changed:${item.title}`}
              item={item}
              sectionLabel={SECTION_LABELS.changed_since_yesterday}
            />
          ))}
          {slate.blocked_but_real ? (
            <SlateItemCard
              item={slate.blocked_but_real}
              sectionLabel={SECTION_LABELS.blocked_but_real}
            />
          ) : null}
          {slate.watch_item ? (
            <SlateItemCard item={slate.watch_item} sectionLabel={SECTION_LABELS.watch_item} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
