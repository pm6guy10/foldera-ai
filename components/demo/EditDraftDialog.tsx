"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/demo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/demo/ui/dialog";
import { Input } from "@/components/demo/ui/input";
import { Textarea } from "@/components/demo/ui/textarea";
import type { Brief } from "@/lib/demo/demo-data";
import { useDemoStore } from "@/lib/demo/demo-store";

export function EditDraftDialog({
  brief,
  open,
  onOpenChange,
}: {
  brief: Brief;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const editDraft = useDemoStore((state) => state.editDraft);
  const [subject, setSubject] = useState(brief.draft.subject);
  const [body, setBody] = useState(brief.draft.body);

  useEffect(() => {
    if (open) {
      setSubject(brief.draft.subject);
      setBody(brief.draft.body);
    }
  }, [open, brief.draft.subject, brief.draft.body]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit draft</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium tracking-wider text-demo-muted-foreground">
              SUBJECT
            </label>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium tracking-wider text-demo-muted-foreground">
              TO
            </label>
            <div className="mt-1 inline-flex items-center rounded-md border border-demo-border bg-demo-surface px-3 py-1.5 text-sm">
              {brief.draft.to}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium tracking-wider text-demo-muted-foreground">
              BODY
            </label>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              className="mt-1 font-mono text-[13px] leading-relaxed"
            />
            <div className="mt-1 text-right text-xs text-demo-muted-foreground">{body.length} chars</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              editDraft(brief.id, { subject, body });
              onOpenChange(false);
            }}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
