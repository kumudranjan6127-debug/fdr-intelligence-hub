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
- `npm test` (21 vitest tests) · `npm run typecheck` · `npm run lint` · `npm run db:seed` (wipes and reseeds, ~1.5 min)
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

## Next steps
1. `ANTHROPIC_API_KEY` is set on Vercel Production (26 Oct); live extraction uses Claude (about 9 s, 96–97% confidence on the sample). Still optional: `CRON_SECRET`.
2. Idea PPT for 28 Oct, built from the README pitch and fresh live screenshots.
3. After the deadline: roadmap phases P2–P10 (README). The recommendation was P4 (real Account Aggregator) and P10 (metrics) first.

## Conventions
- Commit messages: `feat(scope): …`, in small commits. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Money is stored in paise (Decimal or strings); dates are UTC and displayed in IST.
- Provenance colours: amber = Claimed, blue = Extracted, green = Confirmed, red = Mismatch.
