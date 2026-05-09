export type SourceId = string;

export type Source = {
  id: SourceId;
  kind: "email" | "calendar" | "doc" | "inbox";
  label: string;
  sender: string;
  subject: string;
  snippet: string;
  timestamp: string;
};

export type BriefStatus = "ready" | "attention" | "sent" | "snoozed";

export type Brief = {
  id: string;
  title: string;
  directive: string;
  whyNow: string;
  draft: { subject: string; to: string; body: string };
  citations: SourceId[];
  status: BriefStatus;
  next: string;
};

export type AuditAction = "Drafted" | "Edited" | "Approved" | "Sent";

export type AuditEvent = {
  id: string;
  ts: string;
  actor: string;
  action: AuditAction;
  briefId: string;
  briefTitle: string;
  sources: number;
  status: BriefStatus;
};

export const SOURCES: Record<SourceId, Source> = {
  s1: {
    id: "s1",
    kind: "email",
    label: "Email thread",
    sender: "Alex Morgan",
    subject: "Re: Q3 follow-up — quick question",
    snippet:
      "Thanks for the note. One small adjustment on the timeline before you finalize…",
    timestamp: "Yesterday · 4:42 PM",
  },
  s2: {
    id: "s2",
    kind: "calendar",
    label: "Calendar hold",
    sender: "Calendar",
    subject: "Hold: Alex Morgan sync",
    snippet: "Tentative hold 12:30–1:00 PM today. No invite sent yet.",
    timestamp: "Today · 9:00 AM",
  },
  s3: {
    id: "s3",
    kind: "doc",
    label: "Last draft",
    sender: "You",
    subject: "Draft: Alex Morgan follow-up v2",
    snippet: "Hi Alex — Following up on the update from yesterday…",
    timestamp: "Today · 8:14 AM",
  },
  s4: {
    id: "s4",
    kind: "inbox",
    label: "Connected inbox",
    sender: "brandon@acme.com",
    subject: "Inbox state",
    snippet: "5 open threads · 2 flagged for follow-up.",
    timestamp: "Live",
  },
  s5: {
    id: "s5",
    kind: "email",
    label: "Board chair",
    sender: "Priya Shah",
    subject: "Q3 board agenda — final pass",
    snippet: "Please confirm the agenda before Monday so I can circulate.",
    timestamp: "Today · 7:21 AM",
  },
  s6: {
    id: "s6",
    kind: "doc",
    label: "Agenda doc",
    sender: "Shared drive",
    subject: "Q3 Board Agenda — DRAFT",
    snippet: "Sections: Financials, Hiring plan, Risk register, AOB.",
    timestamp: "Yesterday · 6:02 PM",
  },
  s7: {
    id: "s7",
    kind: "email",
    label: "Vendor",
    sender: "Northwind Renewals",
    subject: "Renewal terms — auto-renew in 9 days",
    snippet: "Confirming pricing of $42k/yr. Reply to lock or revise.",
    timestamp: "2 days ago",
  },
};

export const BRIEFS: Brief[] = [
  {
    id: "alex-morgan-followup",
    title: "Send the follow-up to Alex Morgan before noon.",
    directive: "Send the follow-up to Alex Morgan before noon.",
    whyNow:
      "You have an open thread with no reply [1], the ask is time-bound, and the current hold on your calendar [2] makes this the cleanest unblocker today.",
    draft: {
      subject: "Following up — quick adjustment before noon",
      to: "Alex Morgan <alex@morganpartners.com>",
      body: `Hi Alex —\n\nFollowing up on the update from yesterday [1]. I pulled the latest status [3] and can send the finalized version by noon unless you want one adjustment first.\n\nHappy to hold the 12:30 slot [2] if useful.\n\nBest,\nBrandon`,
    },
    citations: ["s1", "s2", "s3", "s4"],
    status: "ready",
    next: "Await response",
  },
  {
    id: "q3-board-agenda",
    title: "Confirm Q3 board agenda with Priya.",
    directive: "Confirm Q3 board agenda with Priya before Monday.",
    whyNow:
      "Priya needs sign-off [1] to circulate by Monday and the draft agenda [2] only needs the Risk section confirmed.",
    draft: {
      subject: "Q3 board agenda — confirmed",
      to: "Priya Shah <priya@acme.com>",
      body: `Hi Priya —\n\nAgenda looks good [2]. One change: move Risk register before Hiring plan. Otherwise approved to circulate [1].\n\nThanks,\nBrandon`,
    },
    citations: ["s5", "s6"],
    status: "attention",
    next: "Awaiting your approval",
  },
  {
    id: "vendor-renewal",
    title: "Reply to Northwind on renewal terms.",
    directive: "Reply to Northwind to lock or revise the renewal.",
    whyNow: "Auto-renew triggers in 9 days [1]. Locking now avoids a price step-up.",
    draft: {
      subject: "Renewal — confirming for another year",
      to: "Northwind Renewals <renewals@northwind.com>",
      body: `Hi team —\n\nConfirming we'd like to renew at the current $42k/yr terms [1]. Please send the order form for counter-signature.\n\nBest,\nBrandon`,
    },
    citations: ["s7"],
    status: "ready",
    next: "Await counter-sign",
  },
];

export const KPIS = {
  openThreads: 5,
  needAttention: 2,
  readyToMove: 1,
};

export const INITIAL_AUDIT: AuditEvent[] = [
  {
    id: "a1",
    ts: "Today · 8:14 AM",
    actor: "Foldera",
    action: "Drafted",
    briefId: "alex-morgan-followup",
    briefTitle: "Send the follow-up to Alex Morgan before noon.",
    sources: 4,
    status: "ready",
  },
  {
    id: "a2",
    ts: "Today · 7:30 AM",
    actor: "Foldera",
    action: "Drafted",
    briefId: "q3-board-agenda",
    briefTitle: "Confirm Q3 board agenda with Priya.",
    sources: 2,
    status: "attention",
  },
  {
    id: "a3",
    ts: "Yesterday · 5:42 PM",
    actor: "Brandon",
    action: "Approved",
    briefId: "weekly-digest",
    briefTitle: "Weekly digest to leadership.",
    sources: 6,
    status: "sent",
  },
  {
    id: "a4",
    ts: "Yesterday · 5:42 PM",
    actor: "Foldera",
    action: "Sent",
    briefId: "weekly-digest",
    briefTitle: "Weekly digest to leadership.",
    sources: 6,
    status: "sent",
  },
];
