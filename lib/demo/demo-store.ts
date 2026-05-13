"use client";

import { create } from "zustand";
import {
  BRIEFS,
  INITIAL_AUDIT,
  type AuditEvent,
  type Brief,
  type BriefStatus,
} from "./demo-data";

type State = {
  briefs: Record<string, Brief>;
  order: string[];
  audit: AuditEvent[];
  edited: Record<string, boolean>;
  highlightAuditId: string | null;
  editDraft: (id: string, patch: Partial<Brief["draft"]>) => void;
  approveAndSend: (id: string) => void;
  setHighlight: (id: string | null) => void;
};

const initialBriefs: Record<string, Brief> = Object.fromEntries(
  BRIEFS.map((brief) => [brief.id, brief]),
);

function nowStamp() {
  const date = new Date();
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  const meridiem = date.getHours() >= 12 ? "PM" : "AM";
  return `Today · ${hour}:${minute} ${meridiem}`;
}

function setStatus(brief: Brief, status: BriefStatus): Brief {
  return { ...brief, status };
}

export const useDemoStore = create<State>((set) => ({
  briefs: initialBriefs,
  order: BRIEFS.map((brief) => brief.id),
  audit: INITIAL_AUDIT,
  edited: {},
  highlightAuditId: null,
  editDraft: (id, patch) =>
    set((state) => {
      const brief = state.briefs[id];
      if (!brief) return state;
      const nextBrief: Brief = { ...brief, draft: { ...brief.draft, ...patch } };
      const event: AuditEvent = {
        id: `e-${Date.now()}`,
        ts: nowStamp(),
        actor: "Jordan",
        action: "Edited",
        briefId: id,
        briefTitle: brief.title,
        sources: brief.citations.length,
        status: brief.status,
      };
      return {
        briefs: { ...state.briefs, [id]: nextBrief },
        edited: { ...state.edited, [id]: true },
        audit: [event, ...state.audit],
      };
    }),
  approveAndSend: (id) =>
    set((state) => {
      const brief = state.briefs[id];
      if (!brief) return state;
      const updated = setStatus(brief, "sent");
      const ts = nowStamp();
      const approved: AuditEvent = {
        id: `a-${Date.now()}`,
        ts,
        actor: "Jordan",
        action: "Approved",
        briefId: id,
        briefTitle: brief.title,
        sources: brief.citations.length,
        status: "sent",
      };
      const sent: AuditEvent = {
        id: `s-${Date.now() + 1}`,
        ts,
        actor: "Foldera",
        action: "Sent",
        briefId: id,
        briefTitle: brief.title,
        sources: brief.citations.length,
        status: "sent",
      };
      return {
        briefs: { ...state.briefs, [id]: updated },
        audit: [sent, approved, ...state.audit],
        highlightAuditId: sent.id,
      };
    }),
  setHighlight: (id) => set({ highlightAuditId: id }),
}));
