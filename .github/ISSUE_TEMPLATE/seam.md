---
name: Seam
about: One gated unit of work. Format matches AGENTS.md — no seam activates without proof and a stop condition.
title: ""
labels: []
---

## Current truth

<!-- What is true right now, with evidence (file, PR, receipt, log). No vibes. -->

## Required outcome

<!-- The single outcome this seam must produce. One seam, one outcome. -->

## Scope

<!-- Files/areas allowed. -->

### Forbidden in this seam

<!-- Work that must NOT happen here, even if tempting. -->

## Proof required

<!-- Exact proof that closes this seam. Per AGENTS.md Proof Doctrine:
     deterministic seams list the commands; live-path seams require deployed
     verification, persisted row, or real user-journey proof. -->

- [ ] `npm run gate:continuity`
- [ ] <!-- focused tests / browser proof / production verification -->

## Stop condition

<!-- When to stop: the terminal state (MERGED_AND_CLOSED / BLOCKED_WITH_EXACT_RECEIPT /
     HUMAN_REVIEW_REQUIRED_WITH_REASON / STOPPED_WITH_AUTHORIZED_REASON) and the
     receipt that must exist. -->
