"use client";

import { useEffect } from "react";
import { StatusPill } from "@/components/demo/StatusPill";
import { useDemoStore } from "@/lib/demo/demo-store";

export function DemoAuditPage() {
  const events = useDemoStore((state) => state.audit);
  const highlight = useDemoStore((state) => state.highlightAuditId);
  const setHighlight = useDemoStore((state) => state.setHighlight);

  useEffect(() => {
    if (highlight) {
      const timeout = setTimeout(() => setHighlight(null), 2200);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [highlight, setHighlight]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
      <p className="mt-2 text-sm text-demo-muted-foreground">
        Every decision Foldera takes is logged. Source-backed, approval-first.
      </p>

      <div className="mt-8 overflow-hidden rounded-lg border border-demo-border bg-demo-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-demo-border bg-demo-surface-elevated text-left text-[11px] font-medium uppercase tracking-[0.14em] text-demo-muted-foreground">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Brief</th>
              <th className="px-4 py-3 text-center">Sources</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className={`border-b border-demo-border last:border-b-0 transition-colors ${
                  event.id === highlight ? "bg-demo-accent/10" : ""
                }`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-demo-muted-foreground">{event.ts}</td>
                <td className="px-4 py-3">{event.actor}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-demo-border bg-demo-surface-elevated px-2 py-0.5 text-xs">
                    {event.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-demo-foreground/90">{event.briefTitle}</td>
                <td className="px-4 py-3 text-center text-demo-muted-foreground">{event.sources}</td>
                <td className="px-4 py-3">
                  <StatusPill status={event.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
