"use client";

import { Calendar, FileText, Inbox, Mail } from "lucide-react";
import { SOURCES, type SourceId } from "@/lib/demo/demo-data";

const ICONS = {
  email: Mail,
  calendar: Calendar,
  doc: FileText,
  inbox: Inbox,
};

export function SourceTrail({
  citations,
  highlight,
}: {
  citations: SourceId[];
  highlight: SourceId | null;
}) {
  return (
    <div className="rounded-lg border border-demo-border bg-demo-surface-elevated">
      <div className="flex items-center justify-between border-b border-demo-border px-4 py-3">
        <span className="text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
          SOURCE TRAIL
        </span>
        <span className="text-xs text-demo-muted-foreground">{citations.length} sources</span>
      </div>
      <ul className="divide-y divide-demo-border">
        {citations.map((id, index) => {
          const source = SOURCES[id];
          if (!source) return null;
          const Icon = ICONS[source.kind];
          const active = highlight === id;
          return (
            <li
              key={id}
              className={`flex gap-3 px-4 py-3 transition-colors ${
                active ? "bg-demo-accent/10" : ""
              }`}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-demo-surface text-demo-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-demo-foreground">
                    {source.sender}
                    <span className="ml-2 inline-flex h-4 items-center rounded-sm bg-demo-accent/15 px-1 text-[10px] font-medium text-demo-accent">
                      {index + 1}
                    </span>
                  </div>
                  <div className="shrink-0 text-xs text-demo-muted-foreground">
                    {source.timestamp}
                  </div>
                </div>
                <div className="truncate text-sm text-demo-foreground/80">{source.subject}</div>
                <div className="mt-1 line-clamp-2 text-xs text-demo-muted-foreground">
                  {source.snippet}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
