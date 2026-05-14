# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-14 15:35 PT
Current slice: Adversarial Readback Attack - stopped on final CI gate
Current mode: audit only; no product code, no UI polish, no paid generation, no outbound email, no Stripe, no schema, no fake users, no fake source rows.
Current origin/main SHA at handoff update: `2795975bfa5fc2142c4c9867800407742abcaa3c`
Latest commit: `Harden selected-move readback fallback tests`
GitHub Actions status for current origin/main: `CI #1025` failed in `unit`; `Health Gate #608`, `semgrep #1526`, and `Production E2E #1188` passed; `Deploy to Vercel #960` skipped.
Vercel status for current origin/main: READY for `2795975bfa5fc2142c4c9867800407742abcaa3c`; deployment `dpl_GBbsh2PRiWvhxr8wZxghyzJjCtm3`.
Production /api/health SHA: `2795975bfa5fc2142c4c9867800407742abcaa3c`
Current release gate claim: `GATE_9_REAL_NON_OWNER_BETA` remains externally blocked, but final CI is red before that blocker can be treated as the only blocker.
First failing internal proof: `tests/config/__tests__/large-file-splits.test.ts` reports `app/dashboard/page.tsx` at `1008` lines, over the `1000` line threshold.
Stop condition: `NOT DONE - internal gate drift before GATE_9`.
Receipt rule: Product/runtime commits require GitHub CI, Vercel, and production `/api/health` for the exact SHA. Receipt-only commits may record external proof without requiring this file to embed the SHA of its own future commit.

## Current Truth

- Phase 0 passed for the restarted audit: local HEAD, `origin/main`, GitHub Actions, Vercel, and production `/api/health` agreed on `de2722eaeda0af3ba4585a57eb158ff12894bfff` before the readback attack continued.
- Readback attack found latest/detail/history/dashboard currently agree on selected row `d17931e4-ab3d-4d75-9775-61b6c58b22b4` as `REQUIREMENTS_NEEDED`.
- Current winner from `winner:autopsy`: `Commitment due in 0d: Submit high-quality .docx documents for document collection`.
- Current selected winner fingerprint: `claim:commitment due in 0d: submit high-quality .docx documents for document collection|refs:commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe`.
- The stale WorkSourceWA row `8aca653a-f0a1-46e9-9af4-323c5cee539b` remains historical/skipped and did not appear as current latest/dashboard.
- The requirements packet is specific enough for the current blocker: known requirements, exact missing inputs, and next action are visible; no fake `.docx` body was produced.
- Real non-owner beta proof is still external: read-only DB proof found zero connected non-owner, non-test, non-mock Google/Microsoft token rows after excluding `OWNER_USER_ID` and `TEST_USER_ID`.
- Final proof is not green because GitHub CI failed before the external beta blocker.

## Verified Proof

- `npm run health` passed with `RESULT: 0 FAILING`.
- `npm run gate:status` stopped at `GATE_9_REAL_NON_OWNER_BETA` with `BLOCKED_EXTERNAL`.
- `npm run gate:quality` passed.
- `npm run gate:visual` passed.
- `npm run winner:autopsy` selected the document-collection winner.
- `npm run gate:decision-trace` passed.
- Focused readiness/latest/detail/history/dashboard unit tests passed (`39/39`).
- Focused dashboard readback/render tests passed (`2/2`).
- Production authenticated latest/detail/history/dashboard readback agreed on row `d17931e4-ab3d-4d75-9775-61b6c58b22b4` as `REQUIREMENTS_NEEDED`.
- Read-only DB beta proof found no real connected non-owner token rows.
- `npm run build` passed locally.
- GitHub `CI #1025` failed on `tests/config/__tests__/large-file-splits.test.ts`.
- Vercel deployment `dpl_GBbsh2PRiWvhxr8wZxghyzJjCtm3` is `READY`.
- Production `/api/health` serves `2795975bfa5fc2142c4c9867800407742abcaa3c`.

## Next exact move

1. Fix only the CI gate drift in `app/dashboard/page.tsx` enough to bring it back under the `1000` line split threshold.
2. Run `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`.
3. Run the required dashboard CI lane after that narrow split fix.
4. Commit, push, and verify GitHub CI, Vercel READY, and production `/api/health` for the exact final SHA.
5. Resume the adversarial audit only after CI is green.

## Do Not Touch

- UI redesign or polish
- Broad artifact rewrite
- Upload/file-management system
- Paid generation
- Outbound email
- Stripe or pricing
- Schema or destructive DB actions
- Fake users, source rows, document content, deadlines, emails, or beta proof
