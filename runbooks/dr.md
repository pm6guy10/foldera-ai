# DR Rehearsal Playbook
Goal: prove we can restore in <30 min.

1) Create Supabase staging project and restore latest prod snapshot.
2) Configure Vercel Preview env with staging secrets.
3) Run:
   pnpm install
   pnpm test
   TRIALS=1000 pnpm trials
   pnpx playwright install
   pnpm test:e2e
4) Generate one motion via API, open DOCX, confirm audit_events row with SHA-256.
5) Record elapsed time, issues, and fixes here:
- Date:
- Operator:
- Elapsed:
- Notes:
