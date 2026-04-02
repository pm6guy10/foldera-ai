# Local owner session (autonomous `/api/dev/*` hammer)

These files support **local-only** dev routes (`ALLOW_DEV_ROUTES=true`). Do **not** enable `ALLOW_DEV_ROUTES` on Vercel production.

## One-time setup

1. Copy [`.env.example`](../../.env.example) to `.env.local` and fill required keys (NextAuth, Supabase, OAuth, `ANTHROPIC_API_KEY`, etc.).
2. Start dev: `ALLOW_DEV_ROUTES=true` + `npm run dev` (note the port if not 3000).
3. Save owner cookies:

   ```bash
   npm run test:local:setup
   ```

   Sign in at `/login` as the **owner** account (`OWNER_USER_ID` in `lib/auth/constants.ts`). When `/dashboard` loads, `auth-state-owner.json` is written next to this README.

If Next listens on **3001** (port busy), set before setup:

```bash
set LOCAL_BASE_URL=http://localhost:3001
npm run test:local:setup
```

## Agent / CLI brain-receipt

With dev server running and `ALLOW_DEV_ROUTES=true`:

```bash
npm run test:local:brain-receipt
```

Optional full-page screenshot of the email preview:

```bash
npm run test:local:brain-receipt -- --screenshot artifacts/brief.png
```

## Production smoke (separate)

`tests/production/auth-state.json` is for **`https://www.foldera.ai`** only. Refresh with `npm run test:prod:setup` when Playwright auth suites skip or fail. See [CLAUDE.md](../../CLAUDE.md).
