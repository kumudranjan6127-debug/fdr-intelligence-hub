# FDR Intelligence Hub

**Smart India Hackathon 2026 · SIH26265 — Streamline of Security Deposit / FDR Portal** (AICTE Regulation Bureau · Smart Automation · Software)

A verification-first portal for the security deposits / Fixed Deposit Receipts that technical institutions keep with AICTE for 10 years. Every field shows **who vouched for it**, renewal chains are **checked automatically**, and every lien-release NOC is **verifiable by the bank via QR**.

## The problem in five lines

1. A Trust opening a technical institution must keep a security deposit with AICTE for 10 years. It is either an FDR held by a bank with a lien to the Member Secretary, AICTE, or (since 2019-20) an online deposit to AICTE's account.
2. Over a decade the FDR gets renewed, replaced and topped up. Each event creates a new instrument that needs a fresh lien, and nothing links the chain.
3. Officers track lakhs of records across spreadsheets, email and a legacy portal. They cannot tell what an institution typed from what a bank actually confirmed.
4. AICTE's own [Feb 2019 notice](https://aicte.gov.in/sites/default/files/Message%20for%20portal.pdf) on FDRs from 2010-11 lists three failures: banks not responding, interest not refunded, releases never applied for.
5. They share one root cause: **no system says what each instrument needs next.**

## What makes this different

| # | Differentiator | Where to see it |
|---|---|---|
| U1 | **Three-tier provenance on every field:** *Claimed* (institution) · *Extracted* (AI, with confidence) · *Confirmed* (bank). Badges always carry a text label. | FDR Passport, officer case review |
| U2 | **Renewal chain X-ray:** a timeline of the chain, with automatic checks for coverage gaps, amount drops and missing liens | FDR Passport → Renewal chain |
| U3 | **Account Aggregator bank verification:** an `AAProvider` interface returning the TERM_DEPOSIT shape. The MVP uses a **Mock AA sandbox**; Setu/Finvu come in Phase 4. | "Fetch bank confirmation" |
| U4 | **Verifiable NOC:** SHA-256 anchored at issue, QR on the letter and on a downloadable PDF copy, a public `/verify/:code` page, revocation, and a byte-level tamper check | `/noc/:code`, `/api/noc/:code/pdf`, `/verify/:code` |
| U5 | **APH rules + penalty engine:** versioned JSON rules checked against the APH 2024-27 text: the Table 1.4 deposit per programme and level, lease doubling, the Government / aided exemption, the 15-day Affidavit 3 window with 10% / 20% late tiers, and release deductions of 50% (no EoA for six years, cl. 2.21(i)) or 10% (late closure documents, cl. 2.21(h); early encashment, cl. 7.7). The public `/policy` rule register quotes the clause and page for each rule and flags the handbook-vs-guidelines conflict (20% vs 50%). | Release case → Penalty; `/policy` |
| U6 | **Institution risk score:** 40·late renewals + 30·gap days/30 + 20·open discrepancies + 10·overdue cases (cap 100). The queue is sorted by it. | `/officer`, dashboard |
| U7 | **Unclaimed matured deposits finder:** deposits past their 10-year term with no release application, plus a one-click notice draft | Dashboard |
| U8 | **"Why is this pending?":** for every open case, the blocking step, owner, days pending, next action and evidence | Passport, case review, queue |
| U9 | **Duplicate FDR detection:** the same file (SHA-256) on another instrument, the same bank + FDR number (HIGH across institutions, MED within one), or a near-duplicate (one-character-off number, or same bank, principal and issue date). Renewal-chain members are never flagged. | Case review → Discrepancies; seed plant: Deccan Plateau re-uploads Sundarbans' FDR |
| U10 | **Evidence controls:** every bank value carries its source; sandbox values are labelled "Sandbox · not bank evidence", NOCs record what they rest on, and outside `DEMO_MODE` the Mock AA is refused and a NOC needs live bank confirmation. | Case review, NOC letter, `/verify/:code` |

Also included:

- an append-only audit log in which each event's hash covers the previous one (re-verified on `/audit`)
- a server-side state machine (`lib/transitions.ts`)
- role checks on every action, and Zod on every input
- government-portal layout (GIGW conventions): a top bar with skip link, text size (A- / A / A+), high contrast and an English / हिंदी switch; a blue menu bar; a prototype disclaimer strip; breadcrumbs; FAQ; and a full footer with the last-updated date. Hindi covers the menus and public pages; officer screens are in English. No national emblem or AICTE logo is used.

## Measured results

`npm run eval` builds a seeded, labelled dataset of 210 cases: clean deposits, format variants and nine planted defect types. Each case gets a real generated PDF, real text extraction and the production engines. Adding `-- --workflow` also drives 30 cases through the real services on a throwaway database. The latest report is in [eval/REPORT.md](eval/REPORT.md) and on the public `/metrics` page:

- 110 of 110 planted defects caught
- 0 of 70 correct deposits flagged
- 30 of 30 workflows completed as expected

The first run found that the near-duplicate rule flagged unrelated same-day ₹50 L deposits, and the rule was tightened. The limits are that the documents are synthetic, OCR is not covered, and bank values come from the sandbox.

## Honest boundaries

- **A matching hash proves a record is *unchanged*, not that a bank issued it.** Authenticity comes from the bank (Account Aggregator / bank portal). The UI and the NOC letter both say so.
- Bank confirmation is the **Mock AA sandbox**. It reads a seeded "bank book" (`BankDepositRecord`) in the same JSON shape a real AA would return. Lien status comes from a mocked bank portal, because the AA term-deposit summary does not include liens.
- Hashes are **anchored in the database** ("Hash anchored (DB) — ledger in Phase 3"); `LedgerAnchor.txRef` is empty until the EVM anchor lands.
- **AI extraction never auto-accepts.** With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5-5`) reads the PDF or image into the *extracted* tier. Without a key, a local text-layer parser does the same for text PDFs and is labelled as such.
- Sign-in uses email + password (scrypt hashes, HMAC-signed session cookie, lockout after 5 failures). With `DEMO_MODE=1` the sign-in page also lists the demo accounts for one-click sign-in; turn it off on any non-demo deployment. Notifications are in-app only. The NOC is an HTML letter with a downloadable PDF copy (QR + record hash); neither is digitally signed yet (P7).
- All institutions, banks, people and documents are **fictional**. Every generated PDF is stamped SPECIMEN. Rule amounts (e.g. ₹25 L per programme) are illustrative and live in the `RuleSet` JSON.

## Demo script (5 flows, brief §5.6)

Run `npm run db:seed` first. Dates are relative to the day you seed.

1. **New submission.** Sign in as *Rakesh Tiwari* (Ganga Valley) and go to **Submit instrument**.
   - Choose FDR / New deposit and enter Bharat Union Bank, `BUB2026160022`, ₹50,00,000, 2026-10-21 → 2029-10-21.
   - Upload the specimen **"FDR ₹45 L"**. The AI reads ₹45 L; the mismatch is highlighted and you keep your claim.
   - Confirm and submit. You land on the FDR Passport, where the case has been created.
2. **Discrepancy identification.** Switch to *Arjun Mehta* (Regulation Bureau). The queue is sorted by risk.
   - Open the new case: the document viewer is on the left, and Claimed ₹50 L vs Extracted ₹45 L is shown in red.
   - Click **Fetch bank confirmation** (Mock AA). Confirmed ₹45 L is added.
   - Request clarification (a reason is mandatory).
3. **Renewal.** Open Shivneri's expiring FDR. The chain timeline shows the **47-day coverage gap**.
   - Narmada's latest FDR shows the **₹50 L → ₹45 L drop**.
   - Kaveri's latest FDR has **no lien** (claimed yes, document and bank say no).
4. **Validity tracking / approaching maturity.** Open the **Dashboard**: expiring in ≤ 30 days, the aging chart, and the unclaimed matured list with **Draft notice**.
   - Click **Run maturity job** (the same as `GET /api/cron/maturity`). Reminders are created; running it again creates none.
5. **Authorized release + tamper evidence.** Open Konkan's release case. "Why pending" reports *Legal cell, 18 days, SLA breached*.
   - Sign in as *Rohini Kulkarni* (Legal) and click **Clear**. The penalty engine applies **10%** because Konkan filed its closure documents late (APH cl. 2.21(h)).
   - Sign in as *Dr. S. Raghavan*, click **Approve release**, then **Issue lien-release NOC**.
   - Open the NOC letter and scan or click its QR to reach `/verify/:code`, which shows **Valid**.
   - Click **Flip one byte & re-check** to see a **hash mismatch**. A seeded revoked NOC shows as **Revoked**.
   - *Suresh Iyer* (bank) then confirms the lien is lifted. The case closes and the instrument is *Released*.

`/audit` re-verifies the whole event hash chain.

## Local setup

```bash
npm install                      # also runs prisma generate
npx prisma dev -n fdr -d         # local Postgres (PGlite) — or use your Neon URL
# put the TCP URL it prints in .env as DATABASE_URL (add &pgbouncer=true&connection_limit=1 for PGlite)
npx prisma migrate deploy
npm run db:seed                  # ~1–2 min: 15 institutions, 45 instruments, planted defects
npm run dev                      # http://localhost:3000
npm test                         # engine unit tests (vitest)
npm run test:int                 # integration: real services + Postgres (needs TEST_DATABASE_URL, reseeded per run)
PW_CHANNEL=chrome npm run test:e2e  # browser end-to-end tests (Playwright) against TEST_DATABASE_URL
```

Environment (`.env`):

| Variable | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres, pooled (Neon in production) |
| `DATABASE_URL_UNPOOLED` | yes | Direct connection, used by migrations (same as `DATABASE_URL` locally) |
| `ANTHROPIC_API_KEY` | optional | Claude vision extraction. If unset, the local text parser is used. |
| `BLOB_READ_WRITE_TOKEN` | optional | Vercel Blob for uploads. If unset, bytes are stored in Postgres. |
| `CRON_SECRET` | prod | Protects `/api/cron/maturity` (Vercel Cron sends it as a Bearer token) |
| `NEXT_PUBLIC_APP_URL` | optional | Absolute URL for NOC QR codes (otherwise taken from the request host) |
| `TEST_DATABASE_URL` | tests | Throwaway Postgres for `test:int` and `test:e2e`; migrated and reseeded on every run, so it must differ from `DATABASE_URL` |
| `DEMO_MODE` | demo | `1` shows the demo accounts for one-click sign-in. Leave unset in production. |
| `DEMO_PASSWORD` | optional | Password the seed gives every demo account (default `Demo@26265`) |
| `SESSION_SECRET` | recommended | HMAC key for session cookies. If unset, one is derived from the database URL. |

`npm run samples` regenerates the specimen PDFs in `public/samples/` (byte-stable).

## Deploy (Vercel + Neon)

1. On [vercel.com](https://vercel.com/new) → **Import** this GitHub repo (framework: Next.js, defaults are fine).
2. Before the first deploy: project → **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) automatically.
3. Optional env vars: `ANTHROPIC_API_KEY` (Claude extraction), `CRON_SECRET` (daily maturity cron; Vercel sends it automatically), `BLOB_READ_WRITE_TOKEN`.
4. **Deploy.** On Vercel, `npm run build` runs `prisma migrate deploy`, then seeds the demo data **only if the database is empty**, then `next build`. Redeploys never wipe data.
5. To reset the demo data later: `vercel env pull .env.production.local`, then `DATABASE_URL=<unpooled url> npm run db:seed`.

## Project layout

```
app/                 routes (App Router) + server actions (app/actions.ts)
  institution/       deposits list · submit wizard · FDR Passport
  officer/           risk-sorted queue · split-screen case review
  dashboard/         KPIs · aging · unclaimed finder · notice draft
  noc/ verify/       NOC letter with QR · public verification + tamper check
  bank/ audit/       bank NOC inbox · hash-chain audit trail
  api/cron/maturity  status recompute + reminders
lib/                 pure engines: rules, provenance, discrepancy, chain, risk, hash, transitions, whyPending, extract
lib/services/        DB orchestration: core (sync, risk), workflow, maturity, noc
lib/aa/              AAProvider interface + mock
prisma/              schema, migrations, seed (the demo dataset)
tests/               engine unit tests
```

## Roadmap

| Phase | Adds |
|---|---|
| P2 Auth & roles | Credentials / NextAuth; full RO, Cell and Authority workflows |
| P3 Real ledger | Hardhat EVM: `anchor`, `issueNOC`, `revokeNOC`, `verify`; fills `txRef` |
| P4 Account Aggregator | Setu / Finvu sandbox consent → TERM_DEPOSIT fetch; bank portal fallback; DSC on bank PDFs |
| P5 OCR | Self-hosted PaddleOCR (EN + HI) with LLM fallback; bounding-box evidence crops |
| P6 Notifications | Email, SMS / WhatsApp (DLT); escalation ladder |
| P7 Documents | Affidavit-6 auto-generation, Aadhaar eSign, DSC-signed NOC PDF (an unsigned PDF copy with QR exists today) |
| P8 Migration | Legacy Excel / portal import with AI cleanup and duplicate merge |
| P9 Ops | Fastify API, BullMQ workers, audit export, DPDP consent records |
| P10 Metrics | Harness on seeded cases: % planted defects caught, reminder reliability, turnaround with vs without AA |
