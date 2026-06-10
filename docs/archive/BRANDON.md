# BRANDON.md — Product Brain

This file encodes the product instincts behind Foldera. When making judgment calls about what to fix, what to skip, what to prioritize, and how something should feel, read this first.

---

## Core Product Rule

Foldera delivers finished work, not recommendations. If the user has to do work after approving, the feature is broken. Every directive must include a completed artifact: a drafted email, a document, a calendar event, a research brief, a decision frame, or a wait rationale. "Here's what you should do" is a failure. "Here's what I already did, approve it" is the product.

## The One Metric

Does a stranger connect their email, receive one accurate directive with a finished artifact within 24 hours, and approve it? If yes, the product works. If no, nothing else matters. Every fix, every feature, every decision should be evaluated against this loop.

## UX Philosophy

Less is more. Always.

- One directive per email. One directive on the dashboard. Not two. Not a list.
- One tap to approve. One tap to skip. No other inputs.
- No confidence percentages visible to users. Confidence is internal scoring.
- No "deprioritized" guilt lists. Nobody wants their own tool lecturing them.
- No sticky notes, teach-me boxes, affirmation fields, or paste-your-conversation inputs on the dashboard. Those are productivity app patterns. Foldera is not a productivity app.
- If nothing clears 70% confidence, send nothing. "Nothing today" is a valid email. Silence is better than noise.
- The email is the primary surface. The dashboard is secondary. Most users should never need to open the dashboard.

## Visual Identity

- Dark theme. Cyan/emerald accents only.
- The LP is the brand reference. Everything (emails, dashboard, onboarding, error states) should look like it came from the same product as the LP.
- White backgrounds, raw text, unstyled links, and markdown rendering are all bugs. If it doesn't look like the LP, it's wrong.

## Error Philosophy

- Never show the user an error that's meant for a developer. "Generation failed -- check ANTHROPIC_API_KEY" is a log line, not a directive.
- If generation fails, don't send an email. Don't persist the directive. Don't cache the briefing. Log it and skip.
- If a network request fails, don't show success. Show a retry state.
- If decrypt fails, skip that row. Don't crash the run.
- Every API route returns structured JSON errors. No unstructured 500s.

## Data Philosophy

- User data isolation is non-negotiable. User A's data never touches User B's account. Every session-backed route uses session.user.id. Never fall back to env vars in user-facing routes.
- All signal content is encrypted at rest. No exceptions. No plain text in tkg_signals.content.
- Stale data produces bad directives. Signal freshness matters. Anything older than 30 days gets half weight. Anything older than 90 days gets quarter weight.
- Self-referential signals (Foldera's own directives showing up in email ingestion) must be filtered before they reach the generator.

## Onboarding Philosophy

- Value before auth. The user should feel the product work before giving up their email access.
- Paste-and-try or the LP cold read is the first experience. OAuth comes after they've felt something.
- After OAuth, set expectations: "Your first real read arrives at 7am tomorrow." Don't try to generate from nothing during onboarding.
- Never show a paywall to a user who hasn't received a single accurate directive.

## What "Done" Means

- Code pushed to main.
- npm run build passes with zero errors.
- The change works when the user is not Brandon. If it only works for user e40b7cd8, it's not done.
- No new console.error or console.log calls that leak user behavioral data.
- No new INGEST_USER_ID usage in session-backed routes.

## What to Fix vs What to Skip

Fix it if:
- It breaks the end-to-end loop (connect, sync, generate, email, approve)
- It leaks user data across accounts
- It shows an error to a user that should be internal
- It persists bad data (null artifacts, failed generations, unencrypted content)
- It makes the product look different from the LP

Skip it if:
- It's a cosmetic issue on a page nobody visits
- It's test infrastructure (defer until the product loop works)
- It's a new feature (the backlog is fixes only until FOLDERA_MASTER_AUDIT.md is clear)
- It's SEO, social proof, marketing, or distribution (all post-launch)

## Messaging

The tagline is "Finished work, every morning." Use it everywhere. Kill any competing taglines ("Stop Babysitting Your AI", "Your morning reads are waiting"). One voice. One message.

## When in Doubt

Ask: would a stranger who connected their email today have a good experience tomorrow morning? If this change makes that answer more likely to be yes, do it. If it doesn't, skip it.
