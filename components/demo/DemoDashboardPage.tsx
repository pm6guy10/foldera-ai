"use client";

import { AlertTriangle, Inbox, TrendingUp } from "lucide-react";
import { DailyBriefCard } from "@/components/demo/DailyBriefCard";
import { HowItWorks } from "@/components/demo/HowItWorks";
import { SecondaryBriefCard } from "@/components/demo/SecondaryBriefCard";
import { KPIS } from "@/lib/demo/demo-data";
import { useDemoStore } from "@/lib/demo/demo-store";

export function DemoDashboardPage() {
  const briefs = useDemoStore((state) => state.briefs);
  const order = useDemoStore((state) => state.order);
  const [primaryId, ...rest] = order;
  const primary = briefs[primaryId];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-demo-muted-foreground">
          {today}
        </div>
        <h1 className="mt-2 text-3xl font-semibold leading-tight md:text-4xl">Good afternoon, Jordan.</h1>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-demo-muted-foreground" />
            <span className="text-base font-semibold">{KPIS.openThreads}</span>
            <span className="text-demo-muted-foreground">open threads</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-demo-attention" />
            <span className="text-base font-semibold">{KPIS.needAttention}</span>
            <span className="text-demo-muted-foreground">need attention</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-demo-accent" />
            <span className="text-base font-semibold">{KPIS.readyToMove}</span>
            <span className="text-demo-muted-foreground">ready to move</span>
          </div>
        </div>

        <div className="mt-8">{primary && <DailyBriefCard brief={primary} />}</div>

        {rest.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
              MORE TODAY
            </div>
            <div className="space-y-3">
              {rest.map((id) => (
                <SecondaryBriefCard key={id} brief={briefs[id]} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <HowItWorks />
      </div>
    </div>
  );
}
