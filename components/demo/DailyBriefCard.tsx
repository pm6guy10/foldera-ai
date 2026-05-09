"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Clock,
  Copy,
  FileText,
  Layers,
  Pencil,
  Send,
  Shield,
  Timer,
  Zap,
} from "lucide-react";
import { SOURCES, type Brief } from "@/lib/demo/demo-data";
import { useDemoStore } from "@/lib/demo/demo-store";
import { ApproveDialog } from "./ApproveDialog";
import { DraftBody } from "./DraftBody";
import { EditDraftDialog } from "./EditDraftDialog";
import { SourceTrail } from "./SourceTrail";
import { StatusPill } from "./StatusPill";

export function DailyBriefCard({
  brief,
  expanded = false,
}: {
  brief: Brief;
  expanded?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const edited = useDemoStore((state) => state.edited[brief.id]);
  const isSent = brief.status === "sent";

  const glow =
    brief.status === "ready" || brief.status === "sent"
      ? "border-demo-accent/40 shadow-[0_0_60px_-15px_var(--color-accent)]"
      : "border-demo-border";

  return (
    <>
      <div className={`relative rounded-xl border bg-demo-surface p-6 transition-shadow md:p-8 ${glow}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-demo-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-demo-accent shadow-[0_0_8px_var(--color-accent)]" />
            DAILY BRIEF
          </div>
          <div className="flex items-center gap-3">
            {edited && !isSent && (
              <span className="text-[11px] tracking-wider text-demo-muted-foreground">EDITED JUST NOW</span>
            )}
            <StatusPill status={brief.status} />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <div className="text-demo-accent">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
              DIRECTIVE
            </div>
            <h2 className="mt-2 text-2xl font-semibold leading-tight md:text-3xl">{brief.directive}</h2>
          </div>
        </div>

        <div className="my-6 h-px bg-demo-border" />

        <div className="flex gap-4">
          <div className="text-demo-attention">
            <Clock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-medium tracking-[0.14em] text-demo-attention">
              WHY THIS NOW
            </div>
            <div className="mt-2 text-sm leading-relaxed text-demo-foreground/80">
              <DraftBody body={brief.whyNow} citations={brief.citations} onCitationHover={setHover} />
            </div>
          </div>
        </div>

        <div className="my-6 h-px bg-demo-border" />

        <div className="flex gap-4">
          <div className="text-demo-muted-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
                DRAFT
              </div>
              {!expanded && !isSent && (
                <Link
                  href={`/demo/briefs/${brief.id}`}
                  className="text-[11px] font-medium tracking-wider text-demo-muted-foreground hover:text-demo-foreground"
                >
                  EXPAND →
                </Link>
              )}
            </div>
            <div className="mt-3">
              <DraftBody body={brief.draft.body} citations={brief.citations} onCitationHover={setHover} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 pr-1 text-[11px] font-medium tracking-[0.14em] text-demo-muted-foreground">
            <Layers className="h-4 w-4" />
            SOURCE BASIS
          </div>
          {brief.citations.map((id) => {
            const source = SOURCES[id];
            if (!source) return null;
            return (
              <span
                key={id}
                className="rounded-md border border-demo-border bg-demo-surface-elevated px-3 py-1 text-xs text-demo-foreground/80"
              >
                {source.label}
              </span>
            );
          })}
        </div>

        {expanded && (
          <div className="mt-6">
            <SourceTrail citations={brief.citations} highlight={hover} />
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-demo-border pt-5">
          <div className="flex items-center gap-2 text-xs text-demo-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Grounded in connected sources
          </div>
          {isSent ? (
            <Link
              href="/demo/audit"
              className="inline-flex items-center gap-2 rounded-md bg-demo-accent px-4 py-2 text-sm font-medium text-demo-accent-foreground hover:opacity-90"
            >
              View in audit log
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigator.clipboard?.writeText(brief.draft.body)}
                className="inline-flex items-center gap-2 rounded-md border border-demo-border bg-demo-surface-elevated px-3 py-2 text-sm text-demo-foreground/90 hover:text-demo-foreground"
              >
                <Copy className="h-4 w-4" /> Copy draft
              </button>
              <button className="inline-flex items-center gap-2 rounded-md border border-demo-border bg-demo-surface-elevated px-3 py-2 text-sm text-demo-foreground/90 hover:text-demo-foreground">
                <Timer className="h-4 w-4" /> Snooze 24h
              </button>
              {expanded && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-demo-border bg-demo-surface-elevated px-3 py-2 text-sm text-demo-foreground/90 hover:text-demo-foreground"
                >
                  <Pencil className="h-4 w-4" /> Edit draft
                </button>
              )}
              <button
                onClick={() => setApproveOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-demo-accent px-4 py-2 text-sm font-medium text-demo-accent-foreground hover:opacity-90"
              >
                <Zap className="h-4 w-4" />
                Approve & send
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {!isSent && <div className="mt-2 text-right text-[11px] text-demo-muted-foreground">Next: {brief.next}</div>}
      </div>

      <EditDraftDialog brief={brief} open={editOpen} onOpenChange={setEditOpen} />
      <ApproveDialog brief={brief} open={approveOpen} onOpenChange={setApproveOpen} />
    </>
  );
}
