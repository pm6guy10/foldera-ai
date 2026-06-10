# Foldera launch checklist (manual)

Use this before or right after a major production cutover. Tick items in your tracker as you complete them.

- [ ] **Resend dashboard:** Webhook URL set to `https://foldera.ai/api/webhooks/resend`
- [ ] **Stripe dashboard:** Webhook URL set to `https://foldera.ai/api/stripe/webhook`
- [ ] **Stripe dashboard:** Verify `price_1TF00IRrgMYs6VrdugNcEC9z` is the **$29/mo live** price
- [ ] **Cloudflare:** Email Routing for `support@` and `privacy@` forwarding
- [ ] **Sentry:** Real DSN configured in Vercel env (not a placeholder)
- [ ] **Before April 22:** Refresh `auth-state.json` and update **`FOLDERA_AUTH_STATE`** GitHub secret (production E2E)
- [ ] **QA:** Test with one real **non-owner** user signup
- [ ] **QA:** Test with one real **$29** payment

**Owner-only env audit (after deploy):** signed-in owner can `GET /api/dev/ops-health` for a JSON pass/fail summary of critical env vars and DB connectivity (no secret values in the response).
