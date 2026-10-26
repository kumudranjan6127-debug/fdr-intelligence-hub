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
- **OPEN BUG:** the production site shows "Application error". `/api/health` reports Prisma `P2021`: **the Neon database has no tables** (migrations and seed never ran).
  - The first attempt used a `vercel-build` script, which Vercel ignored.
  - The fix now in `package.json`: `build` = `prisma generate && node scripts/vercel-db-setup.mjs && next build`. That script runs `prisma migrate deploy` and the seed-if-empty step only when `VERCEL` is set.
  - After pushing that fix the database was still empty, so that deploy probably failed or did not run. **Its build log has not been seen yet.**

## Next steps
1. Get Vercel access: the Vercel MCP (installed in `~/.claude.json`; needs `/mcp` → vercel → Authenticate), **or** `npx vercel login`, **or** ask the user for `DATABASE_URL_UNPOOLED`.
2. Read the latest deployment's build log and fix the cause. Alternatively, run `DATABASE_URL=<unpooled> DATABASE_URL_UNPOOLED=<unpooled> npx prisma migrate deploy && npm run db:seed` against Neon. Never commit that URL.
3. Check `https://fdr-intelligence-hub.vercel.app/api/health` shows `ok: true`, then run `scratch/ui-flows.mjs` with `BASE=` set to the live URL.
4. Optional env vars: `ANTHROPIC_API_KEY`, `CRON_SECRET`.
5. After the deadline: roadmap phases P2–P10 (README). The recommendation was P4 (real Account Aggregator) and P10 (metrics) first.

## Conventions
- Commit messages: `feat(scope): …`, in small commits. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Money is stored in paise (Decimal or strings); dates are UTC and displayed in IST.
- Provenance colours: amber = Claimed, blue = Extracted, green = Confirmed, red = Mismatch.
