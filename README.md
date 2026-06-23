# Foldera

**Foldera is a Workday Presence Layer.** It reads the work you've already scattered across email, calendar, files, and tasks, reconstructs the state of your day, and surfaces *the one move that matters right now* — or stays quiet when nothing does.

Not a dashboard. Not a task manager. Not an inbox summarizer. Not a chatbot. One timely, source-grounded re-entry point, with its evidence — and honest silence when there isn't one.

> Foldera finds the workday re-entry point before you do.

## The promise

Modern work is fragmented across a dozen tools, and the cost is the lost thread — the reply you owe, the deadline in your files, the commitment with nothing scheduled against it. Foldera watches *your own* world (never the open web), preserves state across sources, selects **at most one** intervention, lets you act, updates state, and otherwise gets out of the way.

Two rules sit above everything:

- **Value is the only score.** A green build is hygiene, not value. The product exists to produce one act you wouldn't have taken otherwise.
- **Safe silence beats a fake card.** On weak evidence, Foldera says nothing. It never manufactures a verdict and never sends on your behalf.

## How it works

```
connected sources → signals → state reconstruction → candidate hunt
        → scoring & ranking → quality gates → ONE intervention  (or safe silence)
```

1. **Connect sources** — Google (Gmail, Calendar, Drive) and Microsoft (Outlook, Calendar, OneDrive, To Do). Google is the sole sign-in; Microsoft is a connectable source.
2. **Ingest & ground** — sources sync into encrypted signals, each carrying its real source date.
3. **Hunt & score** — a deterministic engine finds candidate "loops" (deadlines, drift, dropped threads) and ranks them by *consequence* — magnitude × irreversibility × who it affects — not by keywords.
4. **Gate** — layered quality gates reject the hollow, the stale, and the ungrounded. Nothing ships without source evidence.
5. **Deliver one move** — the daily verdict is a single grounded card, or an explicit, honest "you're clear."

## Tech stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **Supabase** (Postgres) for state and signals; service-role on the backend, anon key on the client
- **NextAuth** (Google sign-in)
- **Vercel** hosting + scheduled crons (the 11:00 UTC morning pipeline)
- **Vitest** (unit/replay) + **Playwright** (e2e)

## Getting started

```bash
# 1. Install (Node 22 — see .nvmrc)
npm ci

# 2. Configure environment
cp .env.example .env.local        # fill in Supabase, Google OAuth, etc.

# 3. Develop
npm run dev                       # http://localhost:3000

# 4. Prove your change
npm run typecheck
npm run lint
npm run test                      # vitest unit/replay suite
npm run build
```

See `.env.example` for the full list of required secrets (Supabase, Google/Microsoft OAuth, app config).

## Repository map

| Path | What lives there |
|------|------------------|
| `app/` | Next.js routes, API handlers, dashboard UI |
| `components/` | React components |
| `lib/briefing/` | The brain: scoring, hunting, quality gates, generation |
| `lib/sync/` | Source connectors (Google, Microsoft) |
| `lib/signals/` | Signal processing + the behavioral graph |
| `lib/cron/` | Scheduled pipelines (the daily verdict) |
| `docs/` | Architecture, decisions, and the source-of-truth ledger |
| `tests/` | Vitest + Playwright suites |

## Contributing & conventions

This repo runs on a deliberate, low-ceremony contract so that humans and agents can work it safely:

- **`AGENTS.md`** — the single execution contract (how work is scoped, proven, and closed out).
- **`ACTIVE_HANDOFF.md`** — current command state and the next exact move.
- **`docs/SOURCE_OF_TRUTH_MAP.md`** — the keep-list ledger; anything not on it is reference or archive.
- **`FOLDERA_MASTER_BIBLE.md`** — product doctrine and north star.

Guardrails that always hold: no auto-send, no Stripe/Scout/migration/secret changes without explicit scope, every scoring/quality-gate change carries a test plus a before/after read, and no "done" without real product proof. Everything else is allowed by default — fix what needs fixing.
