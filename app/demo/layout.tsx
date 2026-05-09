import type { ReactNode } from "react";
import "./demo.css";
import { Sidebar } from "@/components/demo/Sidebar";
import { TopBar } from "@/components/demo/TopBar";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="demo-theme flex min-h-screen w-full bg-demo-background text-demo-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="flex-1 overflow-x-hidden px-6 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
