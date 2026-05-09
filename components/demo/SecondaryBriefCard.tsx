"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import type { Brief } from "@/lib/demo/demo-data";
import { StatusPill } from "./StatusPill";

export function SecondaryBriefCard({ brief }: { brief: Brief }) {
  return (
    <Link
      href={`/demo/briefs/${brief.id}`}
      className="group flex items-center justify-between gap-4 rounded-lg border border-demo-border bg-demo-surface p-4 transition-colors hover:bg-demo-surface-elevated"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <StatusPill status={brief.status} />
          <span className="inline-flex items-center gap-1 text-[11px] text-demo-muted-foreground">
            <Layers className="h-3 w-3" /> {brief.citations.length} sources
          </span>
        </div>
        <div className="mt-2 truncate text-sm font-medium text-demo-foreground">{brief.title}</div>
        <div className="mt-1 line-clamp-1 text-xs text-demo-muted-foreground">
          {brief.whyNow.replace(/\[\d+\]/g, "").trim()}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-demo-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-demo-foreground" />
    </Link>
  );
}
