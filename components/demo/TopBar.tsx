"use client";

import { Bell, Search } from "lucide-react";

export function TopBar() {
  return (
    <div className="flex items-center justify-end gap-3 border-b border-demo-border bg-demo-background px-6 py-4">
      <div className="hidden items-center gap-2 rounded-md border border-demo-border bg-demo-surface px-3 py-1.5 text-sm text-demo-muted-foreground md:flex md:w-80">
        <Search className="h-4 w-4" />
        <span className="flex-1">Search Foldera…</span>
        <kbd className="rounded border border-demo-border bg-demo-surface-elevated px-1.5 py-0.5 text-[10px] text-demo-muted-foreground">
          ⌘K
        </kbd>
      </div>
      <button className="grid h-9 w-9 place-items-center rounded-md border border-demo-border bg-demo-surface text-demo-muted-foreground hover:text-demo-foreground">
        <Bell className="h-4 w-4" />
      </button>
    </div>
  );
}
