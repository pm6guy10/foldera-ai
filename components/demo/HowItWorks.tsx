"use client";

import { FileText, Layers, Send } from "lucide-react";

export function HowItWorks() {
  const items = [
    { icon: Send, label: "Directive", body: "The single move that matters most right now." },
    { icon: FileText, label: "Draft", body: "Ready-to-send wording when writing is the bottleneck." },
    { icon: Layers, label: "Source trail", body: "The evidence behind the recommendation." },
  ];

  return (
    <div className="rounded-lg border border-demo-border bg-demo-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
          HOW THIS BRIEF WORKS
        </div>
        <span className="text-xs text-demo-accent">Learn more →</span>
      </div>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.label} className="flex gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-demo-surface-elevated text-demo-muted-foreground">
              <item.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs leading-relaxed text-demo-muted-foreground">{item.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
