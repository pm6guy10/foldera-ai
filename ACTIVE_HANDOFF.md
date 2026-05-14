# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-14 06:58 PT
Current slice: GitHub CI final-gate enforcement
Current mode: no product work, no UI polish, no paid generation, no outbound email, no Stripe, no schema, no feature continuation.
Current main commit: 6f0275ead9bc55e89075ab90467d8f3149c8d4d6
GitHub CI status: RED
GitHub CI run: CI #1019, run `25863078234`
GitHub CI failing job: `unit`
GitHub CI failing step: `Vitest`
GitHub CI failing error: `tests/config/__tests__/large-file-splits.test.ts` expected `app/dashboard/page.tsx` line count `1061` to be <= `1000`.
Vercel status: GREEN
Vercel deployment: `dpl_GoEf99ATTkPbEVd8BEi8dyYoqePe`
Vercel production SHA: 6f0275ead9bc55e89075ab90467d8f3149c8d4d6
Done rule: Foldera cannot be called done unless GitHub CI and Vercel are both green for the exact current `origin/main` commit.

## Current Truth

- `npm run health` is green: Gmail fresh, Outlook fresh, mail cursors current, last generation is `write_document`, and `RESULT: 0 FAILING`.
- `origin/main` currently points at `6f0275ead9bc55e89075ab90467d8f3149c8d4d6`.
- GitHub Actions for that commit include a failed `CI` workflow run even though Vercel deployed successfully.
- The latest Codex report missed the red CI because the repo boot/final-report contract required production SHA proof but did not require GitHub Actions proof for the exact commit.
- The only active fix is the CI failure plus final-gate doctrine. Do not continue document-collection or other product work.

## Verified Proof

- GitHub Actions API: `CI` run `25863078234` for commit `6f0275e` concluded `failure`.
- GitHub job API: job `unit` failed; step `Vitest` failed.
- GitHub job log: `large-file-splits.test.ts` failed at line 14 with `expected 1061 to be less than or equal to 1000`.
- Focused failing unit test reproduced locally, then passed after mechanical extraction: `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`.

## Next exact move

1. Finish the narrow code split that reduces `app/dashboard/page.tsx` below 1000 lines without changing behavior.
2. Update `CODEX_START.md`, `GPT.md`, this handoff, and append `SESSION_HISTORY.md` with the GitHub CI final-gate rule.
3. Run `npm run health`, focused failing unit test, and `npm run build`.
4. Commit and push.
5. Check GitHub Actions for the new current `main` commit.
6. Check Vercel deployment for the new current `main` commit.

## Do Not Touch

- Product behavior beyond the mechanical CI split
- UI polish or redesign
- Paid generation
- Outbound email
- Stripe or pricing
- Schema or destructive DB actions
- New feature work
