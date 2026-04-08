# MASTER_PUNCHLIST — Operator index

Single page when you do not want to hunt chat history. **Do not** treat this as a second spec — it **links** the real sources.

| Block | Open this |
|-------|-----------|
| North star | [REVENUE_PROOF.md](../REVENUE_PROOF.md) Gate 4 + gate table; green `npm run test:prod` after deploys |
| Sequenced Cursor work | [docs/MEGA_PROMPT_PROGRAM.md](./MEGA_PROMPT_PROGRAM.md) (S0–S9, baseline tables, paste template) |
| Vision + proof tables | [FOLDERA_PRODUCT_SPEC.md](../FOLDERA_PRODUCT_SPEC.md), [BRANDON.md](../BRANDON.md), [CURRENT_STATE.md](../CURRENT_STATE.md) |
| Automation / ops backlog | [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) |
| Launch manual steps | [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) |
| Runbook | [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md) |

---

## Operator dashboard deep links

Confirm [GitHub remote](https://github.com/pm6guy10/foldera-ai) matches your fork. Vercel / Supabase IDs from [AGENTS.md](../AGENTS.md) and [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md).

| Surface | Link / path | Use for |
|--------|-------------|---------|
| **Production app** | [https://www.foldera.ai](https://www.foldera.ai) | Live product; Settings → Generate Now; Approve flow |
| **Vercel** | [vercel.com/dashboard](https://vercel.com/dashboard) → project `prj_eG5St3NmUtqYGXJwXsANdZBLYr9N` (org `team_y2RdnSgeVsCExRheya1QRB5z`) | Deployments, logs, env vars, cron errors |
| **Cursor → Vercel MCP** | **Cursor Settings** → **Features** → **MCP** → **Vercel** → **Connect** / re-authenticate (browser OAuth). IDs: same as **Vercel** row; also in [`.vercel/project.json`](../.vercel/project.json). | Agents use MCP tools: `list_deployments`, `get_deployment`, `get_deployment_build_logs`, `get_runtime_logs` (e.g. production + `level: error`). **Re-auth** when MCP returns auth errors — there is no separate magic URL; the IDE opens Vercel OAuth when you connect the integration. |
| **GitHub repo** | [github.com/pm6guy10/foldera-ai](https://github.com/pm6guy10/foldera-ai) | Code, Actions |
| **GitHub Actions** | [github.com/pm6guy10/foldera-ai/actions](https://github.com/pm6guy10/foldera-ai/actions) | Workflow runs, artifacts |
| **Supabase** | [supabase.com/dashboard/project/neydszeamsflpghtrhue](https://supabase.com/dashboard/project/neydszeamsflpghtrhue) | Table `tkg_actions`, column `execution_result`, send/debug |
| **Migrations** | [docs/SUPABASE_MIGRATIONS.md](./SUPABASE_MIGRATIONS.md) | Versioned DDL in repo; `npx supabase db push` to apply |
| **Sentry** | [sentry.io](https://sentry.io) → org with Foldera DSN | Production errors |
| **Resend** | [resend.com/emails](https://resend.com/emails) | Outbound brief / delivery logs |
| **Stripe** | [dashboard.stripe.com](https://dashboard.stripe.com) | Webhooks, live price per LAUNCH_CHECKLIST |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Credits when generation fails |

**Owner env smoke (production):** while signed in as **owner**, open [https://www.foldera.ai/api/dev/ops-health](https://www.foldera.ai/api/dev/ops-health) — JSON env + DB checks, no secret values ([app/api/dev/ops-health/route.ts](../app/api/dev/ops-health/route.ts)).

**Production vs `main` (alias race):** `GET https://www.foldera.ai/api/health` must include **`revision.git_sha_short`** (7 chars). Compare to `git rev-parse origin/main` — if www is behind or still shows legacy `build` without `revision`, multiple production deploys finished **out of order** and the wrong one took the alias. **Fix:** push an empty commit to `main` (CI → [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) or **Promote** the deployment whose SHA matches `main` in the Vercel dashboard.

---

## External uptime (UptimeRobot — operator)

**Backlog:** [AUTOMATION_BACKLOG.md](../AUTOMATION_BACKLOG.md) **AZ-08**.

1. Create a monitor (HTTP GET) pointing at **`https://www.foldera.ai/api/health`** (or your production origin + `/api/health`).
2. Expect HTTP **200** and JSON with `"status":"ok"` or `"degraded"` per [app/api/health/route.ts](../app/api/health/route.ts) — alert on non-200 or timeout. Response includes **`revision.git_sha`** (full SHA on Vercel) and **`build`** (7-char prefix or `local`); optional headers **`x-foldera-git-sha`** / **`x-foldera-deployment-id`** — use to confirm prod matches the commit you expect after a deploy.
3. Interval: 5 minutes is sufficient; avoid hammering the route.
4. Optional second monitor: `GET https://www.foldera.ai/` (marketing availability only).

After each **`/api/cron/daily-brief`** run (Vercel cron), the handler’s **`finally`** block calls **`runPlatformHealthAlert()`** ([`lib/cron/cron-health-alert.ts`](../lib/cron/cron-health-alert.ts)) — fetches `/api/health` and emails **`DAILY_BRIEF_TO_EMAIL`** on failure. **`GET /api/cron/health-check`** is still available for manual `CRON_SECRET` triggers. UptimeRobot adds an independent path when email/cron is down.

---

## “Generated” but no email — inspect run-brief JSON

Manual path: [app/api/settings/run-brief/route.ts](../app/api/settings/run-brief/route.ts) → `runBriefLifecycle({ ensureSend: true, ... })`. Send can still return **`email_already_sent`**, **`no_verified_email`**, or other codes.

**Generate now (`?force=true`):** `POST /api/settings/run-brief?force=true` (same session cookies as Generate Now). Sets `forceFreshRun` for manual gates (`skipStaleGate`, etc.) but **does not** skip valid `pending_approval` within **18h** — you get `pending_approval_reused` / guard until you **approve or skip** the current card. A raw `POST` without `?force=true` behaves the same for pending reuse (only differs on other manual flags).

**Steps (operator):**

1. After **Generate Now**, open **DevTools → Network**.
2. Select **`POST /api/settings/run-brief`** → **Response** JSON.
3. Open **`stages.daily_brief.send.results`** (and any per-user `code` / `meta`).
4. Interpret:
   - **`email_already_sent`** — same-day guard; brief may have been sent earlier; dashboard can still show `pending_approval`. Check spam + correct inbox.
   - **`no_verified_email`** — fix verified account email path (see spec / backlog).
   - **`email_sent`** but no mail — spam folder, Resend logs, recipient address.

Code reference for send logic: [lib/cron/brief-service.ts](../lib/cron/brief-service.ts), [lib/cron/daily-brief-send.ts](../lib/cron/daily-brief-send.ts).

---

## Gate 4 live receipt (operator only)

**Agents must not fabricate** [REVENUE_PROOF.md](../REVENUE_PROOF.md) rows. Gate 4 is **Approve** on a real **`send_message`**, then record real `tkg_actions.id` and **`execution_result.sent_via`** (`gmail` / `outlook` / `resend`).

1. Production: mailbox connected; deploy green.
2. Get a **`send_message`** pending action (morning email or Generate Now).
3. **Approve** from email or dashboard.
4. In Supabase, read the row’s **`id`** and **`execution_result.sent_via`** (after execute).
5. Paste into the Gate 4 table in **REVENUE_PROOF.md** (or hand values to an Agent session with explicit paste).

Full checklist: [REVENUE_PROOF.md § Gate 4 live receipt](../REVENUE_PROOF.md#gate-4-live-receipt-operator).

---

## Playwright / auth refresh (when needed only)

- **Local vs production harness:** [docs/LOCAL_E2E_AND_PROD_TESTS.md](./LOCAL_E2E_AND_PROD_TESTS.md) — do not expect `tests/production/*` to pass against `localhost` without production cookies.
- Production smoke: `npm run test:prod:setup` when [tests/production/auth-state.json](../tests/production/auth-state.json) is missing or suites skip.
- Local merge gate: `npm run test:ci:e2e` (CI-parity, mocked APIs).
- Local brain: `npm run test:local:setup` then `npm run test:local:brain-receipt` — [tests/local/README.md](../tests/local/README.md).
- Busy port **3000**: see **Alternate port** in [MEGA_PROMPT_PROGRAM.md](./MEGA_PROMPT_PROGRAM.md) baseline notes (`PLAYWRIGHT_WEB_PORT`).
