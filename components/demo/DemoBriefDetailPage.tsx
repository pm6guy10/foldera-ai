"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyBriefCard } from "@/components/demo/DailyBriefCard";
import { HowItWorks } from "@/components/demo/HowItWorks";
import { useDemoStore } from "@/lib/demo/demo-store";

export function DemoBriefDetailPage({ briefId }: { briefId: string }) {
  const brief = useDemoStore((state) => state.briefs[briefId]);

  if (!brief) {
    return <div className="text-sm text-demo-muted-foreground">Brief not found.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <Link
          href="/demo"
          className="inline-flex items-center gap-1.5 text-xs text-demo-muted-foreground hover:text-demo-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="mt-6">
          <DailyBriefCard brief={brief} expanded />
        </div>
      </div>
      <div className="space-y-6">
        <HowItWorks />
      </div>
    </div>
  );
}
