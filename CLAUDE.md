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
- Live check: `scratch/ui-flows-live.mjs` (no DB access; finds ids from page links) passed all 5 flows on the live URL. Each run adds a test submission and uses up the one `CLEARANCES_PENDING` release case, so **reseed Neon before the real demo**.
- Demo gap: Narmada's amount-drop FDR (seed chain B3) has no link anywhere in the officer UI; the presenter needs its direct URL.

## Next steps
1. Reseed Neon before the demo (needs `DATABASE_URL_UNPOOLED` from the user, or a one-off forced reseed), then recheck `/api/health`.
2. Optional env vars: `ANTHROPIC_API_KEY`, `CRON_SECRET`.
3. After the deadline: roadmap phases P2–P10 (README). The recommendation was P4 (real Account Aggregator) and P10 (metrics) first.

## Conventions
- Commit messages: `feat(scope): …`, in small commits. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Money is stored in paise (Decimal or strings); dates are UTC and displayed in IST.
- Provenance colours: amber = Claimed, blue = Extracted, green = Confirmed, red = Mismatch.
