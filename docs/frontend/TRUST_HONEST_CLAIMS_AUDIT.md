# Trust, Privacy & Honest-Claims — Master Audit #445, Pass 8

> Status: written 2026-06-20. Forensic pass over every public claim-bearing surface
> (landing, `/pricing`, `/security`, demo) against the Trust & Honest-Claims Officer
> kill-questions (`docs/EXPERT_PANEL.md` §9) and the Bible safety rails. No paid
> calls. Verdict: **`PASS` (after fix)** — one real false enterprise claim found and
> **removed in-pass**, plus a durable gate hardening so it cannot regress.

---

## TL;DR

The forbidden-claim gate (`findForbiddenClaimFailures`) was already green: no
`SOC2`/`HIPAA`/`surveillance`/`auto-send`/`guaranteed`-class copy anywhere in
`app`/`components`/`public`. Consent framing is honest (read-only connectors,
scoped/revocable, "No training on your data," encryption at rest). **But** the
landing and `/pricing` displayed an **"SSO / SCIM" / "SAML 2.0 ready" enterprise
claim — and no SAML/SCIM/SSO is implemented** (auth is consumer Google + AzureAD
OAuth only). That is exactly the "enterprise tier theater / claims outrun proof"
failure mode the Bible forbids. **Fixed:** the unproven claim is removed from both
surfaces and `SSO/SCIM`/`SCIM`/`SAML` are added to the forbidden-claim keep-list so
the claim can never silently return.

---

## Kill-question scorecard (EXPERT_PANEL.md §9)

| Kill-question | Verdict | Evidence |
|---|---|---|
| Any copy claims enterprise/compliance/customer/connector breadth we haven't proven? | **BLOCK → FIXED** | "SSO / SCIM" (landing enterprise strip) + "Read-only, SSO/SCIM, audit logs" (`/pricing`) claimed enterprise auth that does not exist (only Google/AzureAD OAuth). Removed; gate hardened. |
| Consent framed honestly (what we see/store/can't prove)? | **PASS** | "Read-only connectors by default", "Least privilege · scoped, revocable", "No training on your data, ever", `/security`: "Content and tokens encrypted separately. TLS in transit." |
| Could a screenshot/line imply surveillance / "monitors everything"? | **PASS** | Landing leads with "No surveillance · No screen-reading. Ever."; `surveillance`/`screen-reading`/`monitors everything` are hard-forbidden terms and absent. |
| Owner-only proof implied as customer proof? | **PASS** | No customer-count / "trusted by" / logo-wall claims. Pilot framed as "Honest pilot · staged access · no fake claims." |

---

## The finding — false "SSO / SCIM / SAML 2.0" enterprise claim (BLOCK, fixed)

**Evidence of falsity:** `lib/auth/auth-options.ts` configures exactly two
providers — `GoogleProvider` and `AzureADProvider` (consumer/work OAuth sign-in).
A repo-wide search found **no SAML, no SCIM, no SSO provisioning** implementation
anywhere. "SSO / SCIM" and "SAML 2.0 ready" therefore asserted enterprise identity
capabilities the product does not have.

**Fix (fail-safe — only removes an unproven claim, never adds one):**
- `components/foldera/LandingPage.tsx` — dropped the `SSO / SCIM` / `SAML 2.0 ready`
  item from the `enterprise` strip (and its now-unused `Users` icon import). The
  remaining four items are all true: least-privilege OAuth scopes, read-only
  connectors by default, audit logs (= durable `tkg_actions` receipts), no-training.
- `app/pricing/page.tsx` — "Read-only, SSO/SCIM, audit logs" →
  "Read-only connectors, least-privilege access, audit logs" (all proven).

**Durable anti-regression (per CLAUDE.md — extend an existing keep-list, never a new
gate file):** added `SSO/SCIM`, `SCIM`, `SAML` to `forbiddenClaimTerms` in
`scripts/continuity-gate.ts`. The gate now fails CI if any of these reappear in
`app`/`components`/`public`. (Verified these strings have zero legitimate substring
collisions in the scanned roots; bare `SSO` was deliberately **not** added because
it collides with "proce**sso**r"/"le**sso**n".)

---

## Observation (recorded, not a blocker)

- **O-8.1 — demo upsell copy** (`components/demo/Sidebar.tsx:85`): "Unlock team
  features, custom playbooks, and enterprise integrations." This is forward-looking
  copy behind a locked/upsell CTA, not a present-tense capability claim, and names
  no specific unproven standard (no SSO/SCIM/SAML). Left as-is; flagged so a future
  pass re-checks it if team features ship or the framing hardens to present tense.

---

## Proof

- `npm run gate:continuity` green **after** adding the new forbidden terms (proves
  no SSO/SCIM/SAML claim remains in any scanned surface).
- `lib/auth/auth-options.ts` provider audit: Google + AzureAD only (no SAML/SCIM/SSO).
- Pre-push gate (Next build + Playwright public-routes smoke) green.
