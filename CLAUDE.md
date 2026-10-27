# FDR Intelligence Hub — context for Claude sessions

SIH 2026 problem statement **SIH26265** ("Streamline of Security Deposit / FDR Portal", AICTE). Solo developer: Harsh. The user writes in Hinglish and prefers **very simple, step-by-step explanations**; reply in Hinglish. Deadlines: live demo link by **27 Oct 2026**, idea PPT **28 Oct 2026**. README.md has the full pitch, demo script and roadmap — read it first.

## Pitch (protect these in code)
Verification-first, not a CRUD register:
1. Every instrument field has three provenance tiers — `claimed` (institution) / `extracted` (AI, with confidence) / `confirmed` (bank via Account Aggregator). Badges always have text labels.
2. Renewal-chain X-ray: `Instrument.predecessorId` chain checked for coverage gaps, amount drops and missing liens.
3. Verifiable NOC: SHA-256 anchored in `LedgerAnchor`, QR → public `/verify/[code]`, revocation, tamper check.
4. Other features: APH rules/penalty engine, institution risk score, unclaimed-deposit finder, "Why is this pending?".

**Honest boundaries:** the Mock AA sandbox, DB anchoring (ledger in Phase 3), the role-switcher login and fictional data are all labelled in the UI. Never claim that a hash proves a bank issued an FDR.

## Stack and layout
- Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn (Base UI flavour; `cn` comes from the `cn` package)
- Prisma 6 + Postgres; Zod
- `lib/`: pure engines (rules, provenance, discrepancy, chain, risk, hash, transitions, whyPending, extract), with unit tests in `tests/`
- `lib/services/`: DB orchestration (core, workflow, maturity, noc); `lib/aa/` holds the mock AA provider
- `app/(portal)/`: the signed-in pages share one sidebar shell (`components/app-shell.tsx`)
- `app/login`, `app/verify`: public pages
- `app/actions.ts`: all server actions
- Every state change writes a hash-chained `Event` (`lib/events.ts`); transitions are enforced in `lib/transitions.ts`.
- Seed (`prisma/seed.ts`) is the demo dataset with planted defects; `prisma/seed-if-empty.ts` seeds only when the database has no users.
- Extraction: Claude `claude-opus-5-5` when `ANTHROPIC_API_KEY` is set, else the local `unpdf` text parser.

## Commands
- `npx prisma dev start fdr` — start local Postgres (PGlite); then `npm run dev` on port 3000
- `npm test` (33 vitest tests) · `npm run typecheck` · `npm run lint` · `npm run db:seed` (wipes and reseeds, ~1.5 min)
- Local `.env` (gitignored) needs `DATABASE_URL` with `&pgbouncer=true&connection_limit=1` (PGlite shares one connection), plus `DATABASE_URL_UNPOOLED`.
- On Windows, stop the dev server before `npm run build` or before moving folders (file locks).
- Playwright helper scripts live in `scratch/` (gitignored): `ui-flows.mjs` drives all 5 demo flows, `shots.mjs` takes screenshots. They use installed Chrome (`channel: "chrome"`).

## Status (26 Oct 2026)
- MVP steps 1–7 are done. The gov-tech UI redesign is done. All 5 demo flows pass in a real browser. Build, lint and tests are clean.
- GitHub (private): https://github.com/kumudranjan6127-debug/fdr-intelligence-hub — branch `master`. Pushes auto-deploy to Vercel.
- Vercel: https://fdr-intelligence-hub.vercel.app, with Neon connected (both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are set).
- **Deploy bug fixed (26 Oct):** the Vercel dashboard had a Build Command override (`next build`), so `npm run build` (and its migrate + seed-if-empty step) never ran. `vercel.json` now pins `"buildCommand": "npm run build"`. Neon has tables and the demo seed; `/api/health` shows `ok: true`.
- Neon was reseeded on 26 Oct and checked read-only with `scratch/check-live.mjs` (all demo pages OK, no console errors). **Do not run `scratch/ui-flows-live.mjs` on live before the demo:** it adds test data and uses up the one `CLEARANCES_PENDING` release case.
- Reseed live: push a commit whose message contains `[reseed]`. `scripts/vercel-db-setup.mjs` then runs the full seed on that one deploy. Never put `[reseed]` in an ordinary commit message.
- Dashboard "Renewal chain alerts" links the Shivneri gap, the Narmada amount drop and the Kaveri missing lien. The links open `?tab=chain` on the passport.
- OCR: there is **no PaddleOCR** yet (it is roadmap P5). The text parser only reads PDFs that have a text layer; scanned files need `ANTHROPIC_API_KEY` (Claude).

## Review hardening (27–28 Oct, live)
An outside review asked for six things. Done so far:
- **Auth:** scrypt passwords, HMAC-signed expiring session cookie (`lib/auth.ts`, `lib/session.ts`), lockout after 5 failures. One-click demo accounts only with `DEMO_MODE=1` (set on Vercel). Demo password `Demo@26265` (`DEMO_PASSWORD`). No user ids in the sign-in HTML.
- **Evidence controls (`lib/evidence.ts`):** each Confirmed value carries `AA_MOCK` / `BANK_PORTAL_MOCK` or a live source. The UI shows "Sandbox · not bank evidence" and a "Sandbox match" verdict. NOC payloads record `bankEvidence`. Outside demo mode the Mock AA throws `EvidenceError` and a NOC needs live confirmation.
- **Duplicates (`lib/duplicates.ts`):** `DUPLICATE_DOCUMENT` (SHA-256), `DUPLICATE_FDR_NUMBER` (HIGH across institutions, MED within one), `NEAR_DUPLICATE_FDR`. Chain members are excluded. Seed plant D9: Deccan Plateau re-uploads Sundarbans' FDR. The seed now has 46 instruments.
- **Deploy safety:** `scripts/vercel-db-setup.mjs` migrates and seeds only when `VERCEL_ENV=production`.
- Tests: 33 vitest tests. `scratch/ui-flows.mjs` (local) passes all 5 flows; `scratch/auth-check.mjs` checks sign-in.

Still to do from the review:
1. Integration tests on a real DB and committed Playwright E2E tests (`e2e/`) with CI.
2. Validate the policy engine against the actual APH text: section, page and effective date per rule, with unverified rules labelled "Illustrative".
3. A reproducible evaluation (`npm run eval`): planted-defect dataset → detection rate, false positives, timing and workflow completion, plus a Metrics page.

## Next steps
1. Idea PPT (due 28 Oct), built from the README pitch and fresh live screenshots.
2. Optional: `CRON_SECRET`.
3. After the deadline: roadmap phases P2–P10 (README).

## Conventions
- Commit messages: `feat(scope): …`, in small commits. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Money is stored in paise (Decimal or strings); dates are UTC and displayed in IST.
- Provenance colours: amber = Claimed, blue = Extracted, green = Confirmed, red = Mismatch.
