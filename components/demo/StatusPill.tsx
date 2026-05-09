"use client";

import type { BriefStatus } from "@/lib/demo/demo-data";

const map: Record<BriefStatus, { label: string; cls: string; dot: string }> = {
  ready: {
    label: "READY TO SEND",
    cls: "text-demo-accent",
    dot: "bg-demo-accent shadow-[0_0_8px_var(--color-accent)]",
  },
  attention: {
    label: "NEEDS ATTENTION",
    cls: "text-demo-attention",
    dot: "bg-demo-attention shadow-[0_0_8px_var(--color-attention)]",
  },
  sent: {
    label: "SENT",
    cls: "text-demo-success",
    dot: "bg-demo-success shadow-[0_0_8px_var(--color-success)]",
  },
  snoozed: {
    label: "SNOOZED",
    cls: "text-demo-muted-foreground",
    dot: "bg-demo-muted-foreground",
  },
};

export function StatusPill({ status }: { status: BriefStatus }) {
  const state = map[status];
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] ${state.cls}`}
    >
      {state.label}
      <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
    </span>
  );
}
