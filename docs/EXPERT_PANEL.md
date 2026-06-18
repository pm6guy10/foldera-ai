# EXPERT_PANEL.md — The Fortification Panel ("9999×88")

> Status: `REVIEW_AUTHORITY`. Brandon's standing practice: before shipping, *"fortify it — what would the [security / AI / design / pricing / database…] person say?"* This file makes that panel real and repeatable so an agent can run it **instead of asking Brandon**. Pair with `docs/BRANDON.md` (taste authority) and `FOLDERA_MASTER_BIBLE.md` Part IV (binding ritual).
>
> Each expert wields a **real, current framework** (cited), asks **Foldera-specific kill-questions**, and catches **one failure mode we actually fall into.** Each returns a verdict: `PASS` / `CONCERN` / `BLOCK`. **Any `BLOCK` from a relevant expert stops the ship.** A `CONCERN` must be answered or consciously deferred with a reason.

---

## How to convene the panel (don't run all 9 every time)

Pick the experts whose domain the work touches:

| Work type | Convene |
|---|---|
| Landing / marketing / copy | Growth, Product Designer, UX, Pricing, Trust |
| Dashboard / app UI | Product Designer, UX, Frontend, Trust |
| Brain / scoring / Right Now logic | AI/ML, Trust, UX, (DB if it reads tables) |
| Connectors / data / schema | Security, Database, Trust |
| Pricing / `/pricing` / billing | Pricing, Growth, Trust |
| Anything user-facing that makes a claim | Trust (always) |

Output one block per convened expert. Lead the report with any `BLOCK`/`CONCERN`, then the passes.

---

## 1. Growth & Conversion Strategist
**Wields:** B2B SaaS conversion benchmarks — single dominant CTA converts ~13.5% vs ~10.5% for 5+ CTAs; H1 under ~8 words; the **5-second test** (what / who / why-click understood in 5s); outcome-driven over feature-driven; B2B SaaS visitor→lead averages 2–5%, top performers 8–15%. ([Unbounce](https://unbounce.com/conversion-rate-optimization/the-state-of-saas-landing-pages/), [SaaS Hero](https://www.saashero.net/design/common-landing-page-optimization-mistakes/))
**Kill-questions for Foldera:**
- Does the hero pass the 5-second test for a cognitively-overloaded professional — what it is, who it's for, what to click?
- Is there **one** dominant action repeated, or competing CTAs diluting it?
- Are we selling the **outcome** ("the day's already pieced together for you") or listing features ("connectors, triggers, state")?
**Catches:** feature-listing instead of transformation; multiple co-equal CTAs; jargon hero ("Workday Presence Layer") with no plain-language payoff above the fold.

## 2. Product Designer
**Wields:** `docs/DESIGN_SYSTEM.md` §1a + the Linear/Vercel/Notion bar. Hierarchy, restraint, one accent, real depth, motion with intent.
**Kill-questions:**
- One clear focal point per section, or does the eye wander?
- Is the accent (amber) spent sparingly so it *punches*, or sprayed until it's wallpaper?
- Any cheap tell — AI-cliché icons, neon glass, blur, inconsistent icon set, fake logos?
**Catches:** "too much amber everything"; Sparkles/magic-wand clichés; blurry/cheap motion; uniform bordered-box grids; desktop naively shrunk to mobile.

## 3. UX Researcher
**Wields:** Nielsen's 10 usability heuristics — visibility of system status, match to the real world, user control & freedom, consistency, error prevention, **recognition over recall**, flexibility, aesthetic & minimalist design, help users recover from errors, help & docs. ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/))
**Kill-questions:**
- **System status:** does the user always know what Foldera saw, when, and whether it acted or stayed quiet?
- **User control:** can they undo / snooze / dismiss without a multi-step workflow? (Bible: Done/View/Snooze/Dismiss, one click.)
- **Recognition over recall:** is the next move shown with its evidence, so they don't have to remember context?
- Is the journey unbroken — every nav/logo/link goes somewhere sensible (e.g., the logo returns home)?
**Catches:** dead/non-obvious links; logo that doesn't go home; status the user has to infer; forcing a workflow to answer one prompt.

## 4. Pricing & Monetization Strategist
**Wields:** value-based / PLG pricing; price must lag proven value; free/trial entry before paywall pressure; price justified by repeated value, not breadth. (Mirrors Bible §8 + North Star revenue lock.)
**Kill-questions:**
- Does the price map to a value the user has already *felt*, or are we charging for a promise?
- Is the entry free/low-friction before any paywall pressure?
- Does `/pricing` imply enterprise/seat/SSO value we haven't proven?
**Catches:** Stripe/pricing outrunning proof; enterprise tier theater; anchoring on breadth ("9 connectors") instead of the one repeated re-entry save.

## 5. Security Engineer
**Wields:** OWASP Multi-Tenant Security + Cloud Tenant Isolation — `tenant_id`/`user_id` in **every** query, cache key, and storage path; **RLS is not optional** (any Supabase table without it is publicly API-exposed); **never** use `service_role` keys client-side; validate tenant ownership at the data layer; monitor cross-tenant access. ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), [Supabase RLS](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices))
**Kill-questions (existential for Foldera — it reads email/calendar/Slack):**
- Does every table that holds user signals/state/receipts have RLS scoping to the owning user? Any table without it?
- Is `service_role` ever reachable from client code or an unauthenticated route?
- Could one user's `tkg_signals`/`tkg_actions`/presence state ever surface in another user's response? Where's the test that proves not?
- Are connector tokens encrypted at rest and never logged?
**Catches:** a cross-tenant leak (catastrophic for a product whose whole pitch is reading your private work); raw private content in logs/receipts; an RLS-less table.

## 6. AI/ML Engineer
**Wields:** grounding/faithfulness as the primary LLM metric — grounded tasks hallucinate 0.7–1.5%, open-ended 40–80%; evaluating multiple candidates and picking the most *faithful* lowers error without retraining; contextual grounding cuts hallucination 30–50%. ([Lakera](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models), [Factored](https://www.factored.ai/engineering-blog/llm-hallucination-evaluation)) — this **is** the Bible's "no verdict is better than a fake verdict."
**Kill-questions:**
- Is every verdict **grounded in a real source trail**, or is the model free-associating? Where's the evidence row?
- When evidence is weak, does the system **stay quiet** rather than manufacture confidence?
- Is the winner chosen by a **scored** decision (stakes/urgency/freshness), not recency or vibes? (the "magic invariant")
- Is there an eval/fixture proving the brain doesn't fabricate a move from thin signals?
**Catches:** the recurring failure — a confident-sounding card with `relatedEmails: []`; recency masquerading as relevance; "reads my calendar and pretends to be smart."

## 7. Database / Data Engineer
**Wields:** multi-tenant Postgres discipline — `user_id`/`tenant_id` on every row + index; RLS at the DB layer as defense-in-depth; idempotent writes (content-hash dedupe); migrations committed + applied + verified, never ad-hoc.
**Kill-questions:**
- Is every signal/action write idempotent (dedupe by `content_hash`) so reprocessing can't double-fire an intervention?
- Are receipts durable and append-only — can we always reconstruct before-state, verdict, response, after-state, source trail? (Bible: receipts are durable truth.)
- Do queries that power the Right Now card hit indexes, or table-scan as data grows?
- Did any schema change skip the committed+applied+verified migration path?
**Catches:** duplicate interventions from non-idempotent ingest; receipt gaps that let the loop claim false success; unindexed hot-path queries.

## 8. Frontend Performance & Accessibility Engineer
**Wields:** Core Web Vitals (LCP/CLS/INP), zero horizontal overflow at 375/390, ≥44px tap targets, visible focus rings, `prefers-reduced-motion`, semantic headings, color-contrast AA.
**Kill-questions:**
- Any layout shift or overflow at 375? Tap targets ≥44px? Focus rings visible?
- Does motion respect `prefers-reduced-motion`, and is content readable if JS/rAF is throttled (never gate base content on animation)?
- Is the hero image/product-window weight reasonable for LCP, or are we shipping a 1MB PNG?
- Contrast: is any "faded" text below AA against the dark canvas? (we just fixed one.)
**Catches:** content gated on framer enter-anim (blank hero); illegible faded text; overflow; motion that ignores reduced-motion.

## 9. Trust, Privacy & Honest-Claims Officer
**Wields:** Bible safety rails — no surveillance/screen-reading framing; consent-first; no raw private content in receipts/logs; **claims lag proof**; no fake SOC2/HIPAA/enterprise/customer/Slack-breadth claims (also enforced by the `findForbiddenClaimFailures` gate).
**Kill-questions:**
- Does any copy claim enterprise/compliance/customer/connector breadth we haven't proven?
- Is consent framed honestly — what we see, store, and cannot prove?
- Could a screenshot or line imply surveillance / "monitors everything"?
- Is this owner-only proof being implied as customer/non-owner proof?
**Catches:** the exact thing Brandon corrected — claiming the product is proven when it's owner-synthetic; forbidden-claim copy; surveillance-adjacent framing.

---

## Output format (paste this into the closeout)

```
PANEL REVIEW — <what was reviewed>
Convened: <experts>
• Growth:        PASS — <one line>
• Product Design: CONCERN — <one line + what you did>
• Security:      BLOCK — <one line>  ← stops ship until resolved
...
Verdict: SHIP / FIX-FIRST (<n> blocks, <n> concerns)
```

A `BLOCK` is not a suggestion — it's a stop. Resolve it or escalate to Brandon with the exact blocker (don't silently ship past it). This panel exists so that when Brandon asks "did you fortify it?", the honest answer is already "yes — here's the board."
