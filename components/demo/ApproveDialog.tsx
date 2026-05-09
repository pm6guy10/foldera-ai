"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Shield, Zap } from "lucide-react";
import { Button } from "@/components/demo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/demo/ui/dialog";
import type { Brief } from "@/lib/demo/demo-data";
import { useDemoStore } from "@/lib/demo/demo-store";

export function ApproveDialog({
  brief,
  open,
  onOpenChange,
}: {
  brief: Brief;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const approve = useDemoStore((state) => state.approveAndSend);
  const router = useRouter();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) setSent(false);
  }, [open]);

  const summary = brief.draft.body
    .replace(/\[\d+\]/g, "")
    .split("\n")
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {!sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Approve & send</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-demo-border bg-demo-surface-elevated p-4">
                <div className="text-xs tracking-wider text-demo-muted-foreground">SUBJECT</div>
                <div className="mt-1 text-sm font-medium">{brief.draft.subject}</div>
                <div className="mt-3 text-xs tracking-wider text-demo-muted-foreground">TO</div>
                <div className="mt-1 text-sm">{brief.draft.to}</div>
                <div className="mt-3 text-xs tracking-wider text-demo-muted-foreground">SEND AS</div>
                <div className="mt-1 text-sm">Brandon · brandon@acme.com</div>
                <div className="mt-3 text-xs tracking-wider text-demo-muted-foreground">PREVIEW</div>
                <p className="mt-1 line-clamp-2 text-sm text-demo-foreground/80">{summary}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-demo-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Grounded in {brief.citations.length} connected sources
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  approve(brief.id);
                  setSent(true);
                  setTimeout(() => {
                    onOpenChange(false);
                    router.push("/demo/audit");
                  }, 1400);
                }}
              >
                <Zap className="mr-1 h-4 w-4" />
                Approve & send
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-demo-success/15 text-demo-success">
              <Check className="h-6 w-6" />
            </div>
            <div className="text-base font-semibold">Sent to {brief.draft.to.split("<")[0].trim()}</div>
            <div className="text-sm text-demo-muted-foreground">Logged to audit · opening audit log…</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
