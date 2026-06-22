# Foldera

Autonomous personal agent. Connects to your email/calendar/drive, infers what you
need, and delivers one finished act to Slack. You approve or you don't.

## Run locally

```bash
npm install && cp .env.required .env.local && npm run dev
```

Fill in the values in `.env.local` (see `.env.required` for the list).

## Deploy

```bash
vercel deploy --prod
```

## The loop

1. Sources sync (Gmail, Calendar, Drive, Microsoft).
2. The brain scores what changed.
3. The brain decides: act, or stay quiet.
4. If it acts: draft → Slack card → you approve → it sends.
5. Receipt logged. Quiet until the next trigger.

See `VISION.md` for what Foldera is (and isn't), and `docs/SYSTEM_INVENTORY.md`
for the architecture.
