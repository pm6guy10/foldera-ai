"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  Folder,
  Inbox,
  LayoutGrid,
  Puzzle,
  Radio,
  Settings,
  Sparkles,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Inbox;
  exact?: boolean;
  disabled?: boolean;
};

const items: NavItem[] = [
  { href: "/demo", label: "Executive Briefing", icon: Inbox, exact: true },
  { href: "/demo/playbooks", label: "Playbooks", icon: LayoutGrid, disabled: true },
  { href: "/demo/signals", label: "Signals", icon: Radio, disabled: true },
  { href: "/demo/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/demo/integrations", label: "Integrations", icon: Puzzle, disabled: true },
  { href: "/demo/settings", label: "Settings", icon: Settings, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-demo-border bg-demo-sidebar md:flex">
      <div className="flex items-center gap-2 px-6 pb-8 pt-6">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-demo-accent/10 text-demo-accent">
          <Folder className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Foldera</span>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            const className = `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-demo-secondary text-demo-foreground"
                : "text-demo-muted-foreground hover:bg-demo-secondary/60 hover:text-demo-foreground"
            } ${item.disabled ? "pointer-events-none opacity-50" : ""}`;

            return (
              <li key={item.href}>
                {item.disabled ? (
                  <span className={className}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className={className}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-4 mb-4 rounded-lg border border-demo-border bg-demo-surface-elevated p-4">
        <div className="flex items-center gap-2 text-demo-accent">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Upgrade to Pro</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-demo-muted-foreground">
          Unlock team features, custom playbooks, and enterprise integrations.
        </p>
        <button className="mt-3 grid h-7 w-7 place-items-center rounded-md border border-demo-border text-demo-muted-foreground hover:text-demo-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-demo-border px-4 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-demo-secondary text-sm font-medium">
          B
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Brandon</div>
          <div className="text-xs text-demo-muted-foreground">Workspace Owner</div>
        </div>
        <ChevronDown className="h-4 w-4 text-demo-muted-foreground" />
      </div>
    </aside>
  );
}
