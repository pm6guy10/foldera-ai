# FOLDERA — Master Vision & Strategy Document
**Version 2.2 | March 18, 2026 | Living Document**

---

## The One-Sentence Definition

> Probability-weighted advice and autonomous action grounded in your own historical outcomes, converged with your stated goals — delivered before you ask.

---

## The Flipped Pixel

Facebook's pixel tracks everything you do online to sell you things you didn't ask for, on behalf of someone else.

Foldera is the same architecture pointed inward. Same depth of understanding. Same passive learning. But working for you, not against you.

It absorbs your behavior. Builds a weighted model of who you are. And starts doing your work before you think to ask.

---

## What It Actually Is

Not a chatbot. Not a brief. Not a productivity tool you configure.

**A worker that watches how you operate, learns what good looks like for you specifically, and starts doing it without being told.**

- You don't query it
- You don't prompt it
- You don't tell it what tasks to run
- It observes long enough to infer what you'd want done, then does it

Cowork executes tasks you define. Foldera infers tasks you'd want and executes them first.

---

## The Two Inputs (That's It)

**1. AI Conversations** — your Claude project history. Every decision, pattern, frustration, goal, and breakthrough you've ever talked through. The richest behavioral dataset that exists about you.

**2. Outlook Email** — your commitments, relationships, deadlines, and response patterns. Where your professional life actually lives.

That's 80%+ of everything needed to know you. No browser history. No file system. No calendar required in Phase 1.

Two inputs. One identity graph. Everything else is output.

---

## The Identity Graph

A persistent, weighted model of who you are. Not a database of facts. A living architecture that updates as you make decisions and confirms outcomes.

### Node Types
| Node | What It Captures |
|------|-----------------|
| Decision | A choice made, with context, stakes, and eventual outcome |
| Pattern | A recurring behavioral tendency, named and weighted |
| Goal | A stated desired outcome with a time horizon |
| Relationship | A named person and their influence on your decisions |
| Outcome | The confirmed result of a decision — the receipt |
| Insight | A system-generated observation connecting patterns to goals |

### Weighting Rules
- Recency: recent decisions weight higher
- Stakes: high-stakes decisions weight higher
- Confirmation: user-confirmed outcomes carry full weight
- Domain relevance: same-domain history weights higher for current context

---

## What the User Experiences

### The Demo Flow
1. **Auth first.** Real data. Real email. Real conversations. No simulation.
2. **10 minutes. ~20 questions.** Did it hear you? Does it know you? Is it reading your mind?
3. **Three accurate inferences in a row** — things it knew without being told — and they take out the card.

Not a feature list. Not a pricing page. The feeling of being understood by something that learned them without being taught. That's the conversion event.

### The Holy Crap Moment
The system says something like:

*"You're in a spin cycle right now. Here's what that's cost you historically. Here's the highest probability action based on your own data. Confidence: 81%.*

*And here's what I already did while you were reading this: I drafted the follow-up email you've been avoiding. I flagged three inbox items and drafted responses to all three. I noticed a relationship you haven't touched in 11 days and drafted a check-in. I found two relevant job postings that match your profile and pre-filled the applications."*

Diagnosis plus execution. It doesn't just tell you what to do. It already did it.

### The Artifact Rule
Foldera never recommends. It delivers. Every directive ships with a finished work product. The user's only job is approve or skip. If the user has to do work after approving, the product is broken.

### Why People Pay
Not for insight. For outcomes. Specifically:
- Time recovered from tasks they were doing manually
- Mistakes they didn't make because it caught the pattern first
- Things that didn't fall through the cracks

Quantifiable. Defensible. Worth $99-199/month against the alternative of a human assistant at $40-60K/year.

---

## The Bayesian Engine

Foldera uses Bayesian reasoning applied to personal behavioral history.

**The core insight:** People spin because they can't lock down the highest-probability action. The spinning itself is the lowest-probability behavior.

**What Bayesian gives you:** A confidence score on every recommendation that's traceable to your own data. Not the AI's opinion. Arithmetic on your own history.

You can't argue with yourself. That's why people trust it when they wouldn't trust a chatbot.

### Example Output
> **Decision context:** Waiting on high-stakes external decision, tempted to take additional action.
> **Historical pattern:** In 4 prior similar contexts, additional action produced no result in 3 of 4 cases. Waiting resolved favorably in 3 of 4 cases.
> **Confidence: 78%**
> **Recommended action:** Wait. Be present with family. Do not initiate new search activity.

---

## The Trust Architecture

### The Cold Start Problem
People won't give access until the product proves itself. But it can't prove itself without access.

**Solution:** Start inside a walled garden. Claude project conversations only. No external access required. Just what already exists.

The first holy crap moment happens there. That earns the next permission.

### Permission Tiers
1. **Read-only** — conversations and email, no action taken
2. **Draft but don't send** — all actions staged for approval
3. **Act with confirmation** — executes, notifies you after
4. **Full autopilot** — earned through demonstrated accuracy

Trust compounds. Permissions expand as accuracy proves out.

---

## Go-To-Market

### The Numbers
- Target: replace W2 income in 24 months
- Salary target: ~$75K gross
- At $99/month: 760 users
- At $199/month: 380 users
- **380 users in 24 months is not a crazy number if the holy crap moment is proven**

### Pricing Philosophy
This is not a $49/month product. The alternative is a human chief of staff or VA at $40-60K/year. Price it against the alternative.
- $99/month: entry
- $199/month: standard
- $399/month: power users with full autopilot

### Distribution — First 10 Users
**Not:** cold outreach, Sales Nav, Amplemarket, friends and family for free.

**Yes:** find people publicly complaining about the exact pain Foldera solves.

- Twitter/X: search "I wish I had someone who just handled this"
- LinkedIn: founders and solo operators posting about dropping balls
- Reddit: r/productivity, r/entrepreneur, r/ADHD — people whose systems aren't working

One sentence DM: *"I built something that might help with exactly this — would you try it free for a week and tell me honestly if it works?"*

Not a pitch. A response to someone mid-complaint. They already raised their hand.

### Distribution — Scale
One person with an audience who experiences the holy crap moment and can't stop talking about it.

A newsletter writer, YouTuber, or podcast host who lives in their inbox. They try it. It reads them accurately. They tell 50,000 people.

Can't manufacture it. Position for it by making the product undeniably good.

---

## The 24-Month Plan

### Now — March 18 Production State
- The core loop is working on real data: directive generated, emailed, and user-interacted
- Priority is production hardening and UX polish, not expanding product surface area
- `FOLDERA_MASTER_AUDIT.md` tracks live blockers; `CLAUDE.md` tracks operating details

### Month 1-3 — Foundation
- Clean repo, delete dead code, unify onboarding
- Build artifact generation layer (the product, not the dashboard)
- Wire Outlook data pipeline end-to-end
- Get first holy crap moment on yourself
- Show 3 people, watch their faces

### Month 3-6 — First Users
- Find 10 users via pain signal method
- Charge from day one ($99/month minimum)
- Iterate on what produces holy crap moments consistently
- Do not scale until the moment is repeatable

### Month 6-12 — Traction
- Find the person with the audience
- One newsletter or podcast feature
- Target: 50-100 paying users
- PMP certification (state tuition support)

### Month 12-18 — Acceleration
- Full autopilot feature complete
- Outlook + conversation graph running nightly
- $10-20K MRR
- Evaluate W2 exit timing

### Month 18-24 — Transition
- $75K ARR threshold = W2 optional
- I-O Psychology master's degree exploration
- Kapp Advisory 2.0 emerges from product + credential + network

---

## The Build Sequence

### Phase 1 — Cleanup (current)
1. Delete dead code from prior product eras
2. Remove unused dependencies
3. Unify onboarding into single path at /start
4. Add Microsoft sign-in alongside Google
5. Verify Outlook OAuth end-to-end

### Phase 2 — The Artifact Layer (next)
1. Build lib/conviction/artifact-generator.ts
2. Wire into daily-brief cron (generate directive + artifact together)
3. Update conviction card to show artifact preview with approve/edit/skip
4. Wire execution: approve email = send, approve doc = save, approve event = create
5. Self-feeding loop: all engine and agent outputs feed back through extractFromConversation()

### Phase 3 — Data Pipes
1. Calendar sync cron (Outlook Calendar + Google Calendar)
2. Ongoing Claude conversation auto-capture
3. Contact seeding from Outlook contacts
4. Relationship tracking from email frequency

### Phase 4 — Platform
- Multi-user support
- API for third-party integration
- The Sponge architecture at scale

---

## Current Repo State

See CLAUDE.md in the repo root for accurate technical status, dead code inventory,
working features, broken features, and build priority order. CLAUDE.md is the
operational source of truth. This document is the strategic source of truth.

---

## What Makes This Defensible

**You lived the pain.** Not theorized. Diagnosed from inside the problem. 11 months of job search, 68 applications, no feedback loop, spinning without a scoreboard. That's not a founder story. That's a product specification written in lived experience.

**The data moat.** The longer it runs, the more it knows you. The more it knows you, the more accurate it gets. The more accurate it gets, the higher the switching cost. Nobody starts over with a system that knows them.

**The timing.** Cowork is warming the market. People are experiencing autonomous AI assistance for the first time and immediately wanting more. The appetite is being created right now. Foldera is the more intelligent, more personal next step.

---

## The Origin

> "I don't know the best action with the highest likelihood of producing the result I want. I cannot lock it down, so I cannot have peace."

That's the pain. That's the product. That's the market.

Foldera exists because one person couldn't find this tool when he needed it most. So he's building it.

---

*Last updated: March 18, 2026*
*Next update: After the March 18 consistency backlog is reduced*

---

## Cross-Document Consistency Notes

1. Contradiction: Env var requirements drifted across docs.
   Resolution: `AGENTS.md` is the canonical required-env list, and operational docs should mirror it exactly.
2. Contradiction: Some docs described split `daily-generate` / `daily-send` flows while the live system runs unified `/api/cron/daily-brief`.
   Resolution: Treat `/api/cron/daily-brief` at `0 14 * * *` as the active daily loop and reference `AGENTS.md` for the full cron schedule.
3. Contradiction: Older docs called the product GTM-ready/READY, while live verification on March 17-18 still showed production hardening blockers.
   Resolution: Current truth is that the core loop works, and the remaining work is UX polish plus multi-user hardening.
4. Contradiction: Point-in-time audit notes competed with the master audit for authority.
   Resolution: `FOLDERA_MASTER_AUDIT.md` is the single source of truth for open issues and verification status.
5. Contradiction: Strategic/growth language could drift away from the shipped email-first approval loop.
   Resolution: Strategy and growth docs should assume email is primary, dashboard is secondary, and every directive ships with a finished artifact.
6. Contradiction: Superseded readiness docs could leave stale March 16 claims in the repo.
   Resolution: Keep only current governing docs in the active path; treat stale readiness snapshots as removable or historical-only.
