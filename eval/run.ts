// Reproducible evaluation (`npm run eval`). A seeded generator builds a labelled dataset of FDR cases with planted
// defects; each case gets a real generated PDF, real text extraction (the local parser, so results do not depend
// on an API) and the real detection engines. Results go to eval/results.json and eval/REPORT.md.
// With --workflow, it also drives cases through the real services on TEST_DATABASE_URL (migrated + reseeded).
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { performance } from "perf_hooks";
import { analyzeChain, buildChain, type ChainNode } from "../lib/chain";
import { detectDiscrepancies } from "../lib/discrepancy";
import type { DupCandidate } from "../lib/duplicates";
import { parseFdrText } from "../lib/extract";
import { sha256Hex } from "../lib/hash";
import { makeField, normalize, type Confirmed, type FieldKey, type FieldValue, type TierFields } from "../lib/provenance";
import { makeFdrPdf } from "../lib/samples";

export const SEED = 26265;
const L = (lakh: number) => String(lakh * 100_000 * 100);
const DAY = 86_400_000;
const NOW = new Date("2026-10-28T00:00:00Z");
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY));

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANKS = [
  { name: "Bharat Union Bank", prefix: "BUB", branch: "Connaught Place Branch, New Delhi", ifsc: "BUBK0000112" },
  { name: "Deccan Commercial Bank", prefix: "DCB", branch: "Camp Branch, Pune", ifsc: "DCBK0000412" },
  { name: "Ganga Gramin Bank", prefix: "GGB", branch: "Civil Lines Branch, Varanasi", ifsc: "GGBK0000220" },
  { name: "Konkan Mercantile Bank", prefix: "KMB", branch: "Station Road Branch, Ratnagiri", ifsc: "KMBK0000318" },
];

export type Label =
  | "CLEAN"
  | "FORMAT_VARIANT"
  | "AMOUNT_MISMATCH"
  | "FDR_NUMBER_MISMATCH"
  | "LIEN_MISSING"
  | "COVERAGE_GAP"
  | "AMOUNT_DROP"
  | "BELOW_REQUIRED"
  | "DUPLICATE_DOCUMENT"
  | "DUPLICATE_FDR_NUMBER"
  | "NEAR_DUPLICATE";

const MIX: [Label, number][] = [
  ["CLEAN", 80],
  ["FORMAT_VARIANT", 20],
  ["AMOUNT_MISMATCH", 15],
  ["FDR_NUMBER_MISMATCH", 15],
  ["LIEN_MISSING", 15],
  ["COVERAGE_GAP", 15],
  ["AMOUNT_DROP", 15],
  ["BELOW_REQUIRED", 5],
  ["DUPLICATE_DOCUMENT", 10],
  ["DUPLICATE_FDR_NUMBER", 10],
  ["NEAR_DUPLICATE", 10],
];

/** The code that must fire for a label, and the other codes that are legitimate consequences of the same defect. */
export const EXPECTED: Record<Label, { primary: string | null; allowed: string[] }> = {
  CLEAN: { primary: null, allowed: [] },
  // Correct deposits typed differently (case, spaces, dashes, "Ltd."): nothing should fire.
  FORMAT_VARIANT: { primary: null, allowed: [] },
  AMOUNT_MISMATCH: { primary: "CLAIMED_VS_CONFIRMED", allowed: ["CLAIMED_VS_EXTRACTED", "BELOW_REQUIRED"] },
  FDR_NUMBER_MISMATCH: { primary: "CLAIMED_VS_CONFIRMED", allowed: ["CLAIMED_VS_EXTRACTED", "NEAR_DUPLICATE_FDR"] },
  LIEN_MISSING: { primary: "LIEN_NOT_NOTED", allowed: ["CLAIMED_VS_EXTRACTED", "CLAIMED_VS_CONFIRMED"] },
  COVERAGE_GAP: { primary: "COVERAGE_GAP", allowed: [] },
  AMOUNT_DROP: { primary: "AMOUNT_DROP", allowed: ["BELOW_REQUIRED"] },
  BELOW_REQUIRED: { primary: "BELOW_REQUIRED", allowed: [] },
  DUPLICATE_DOCUMENT: { primary: "DUPLICATE_DOCUMENT", allowed: ["DUPLICATE_FDR_NUMBER", "NEAR_DUPLICATE_FDR"] },
  DUPLICATE_FDR_NUMBER: { primary: "DUPLICATE_FDR_NUMBER", allowed: [] },
  NEAR_DUPLICATE: { primary: "NEAR_DUPLICATE_FDR", allowed: [] },
};

type Deposit = { bank: (typeof BANKS)[number]; no: string; amountL: number; issue: string; maturity: string; lien: boolean };
type Instr = {
  id: string;
  institutionId: string;
  status: string;
  predecessorId: string | null;
  truth: Deposit; // what the bank holds
  doc: Deposit; // what the PDF says
  claimed: Deposit; // what the institution typed
  copyDocOf?: string;
};
/** victimOf: a clean case whose deposit another case copied; being flagged as its partner is correct. */
export type Case = { id: string; label: Label; institutionId: string; requiredL: number; chain: Instr[]; victimOf?: Label };

export function buildDataset(seed = SEED): Case[] {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const used = new Set<string>();
  const number = (bank: (typeof BANKS)[number]) => {
    let n: string;
    do n = `${bank.prefix}${int(2015, 2026)}${String(int(0, 999999)).padStart(6, "0")}`;
    while (used.has(n));
    used.add(n);
    return n;
  };
  const deposit = (o: Partial<Deposit> = {}): Deposit => {
    const bank = o.bank ?? pick(BANKS);
    const issue = o.issue ?? addDays("2023-01-01", int(0, 1300));
    return { bank, no: o.no ?? number(bank), amountL: 50, issue, maturity: addDays(issue, 3 * 365), lien: true, ...o };
  };

  const labels = MIX.flatMap(([l, n]) => Array.from({ length: n }, () => l));
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }

  const cases: Case[] = labels.map((label, i) => {
    const id = `case${String(i + 1).padStart(3, "0")}`;
    const inst = `inst${String(i + 1).padStart(3, "0")}`;
    const mk = (n: number, d: Deposit, status: string, pred: string | null): Instr => ({ id: `${id}-${n}`, institutionId: inst, status, predecessorId: pred, truth: d, doc: d, claimed: d });
    // Chain-shaped labels get a predecessor; others are a single, fresh deposit.
    if (label === "COVERAGE_GAP" || label === "AMOUNT_DROP") {
      const first = deposit({ issue: addDays("2020-01-01", int(0, 300)) });
      const gap = label === "COVERAGE_GAP" ? int(15, 120) : 0;
      const second = deposit({ bank: first.bank, issue: addDays(first.maturity, gap), amountL: label === "AMOUNT_DROP" ? pick([40, 45]) : 50 });
      return { id, label, institutionId: inst, requiredL: label === "AMOUNT_DROP" ? 25 : 50, chain: [mk(1, first, "RENEWED", null), mk(2, second, "ACTIVE", `${id}-1`)] };
    }
    const d = deposit();
    const latest = mk(1, d, "ACTIVE", null);
    if (label === "AMOUNT_MISMATCH") {
      const actual = { ...d, amountL: pick([40, 45]) };
      Object.assign(latest, { truth: actual, doc: actual, claimed: d });
    }
    if (label === "FDR_NUMBER_MISMATCH") {
      const digits = d.no.split("");
      const k = int(d.bank.prefix.length + 4, digits.length - 1);
      digits[k] = String((Number(digits[k]) + int(1, 8)) % 10);
      latest.claimed = { ...d, no: digits.join("") };
    }
    if (label === "FORMAT_VARIANT") {
      const no = d.no.toLowerCase().replace(/^([a-z]+)(\d{4})/, "$1-$2 ");
      latest.claimed = { ...d, no, bank: { ...d.bank, name: `${d.bank.name.toUpperCase()} LTD.` } };
    }
    if (label === "LIEN_MISSING") {
      const actual = { ...d, lien: false };
      Object.assign(latest, { truth: actual, doc: actual, claimed: d });
    }
    return { id, label, institutionId: inst, requiredL: label === "BELOW_REQUIRED" ? 100 : 50, chain: [latest] };
  });

  // Cross-case defects copy from a clean case of another institution; each clean case is used at most once.
  const pool = cases.filter((c) => c.label === "CLEAN");
  for (const c of cases) {
    if (c.label !== "DUPLICATE_DOCUMENT" && c.label !== "DUPLICATE_FDR_NUMBER" && c.label !== "NEAR_DUPLICATE") continue;
    const victim = pool.splice(Math.floor(r() * pool.length), 1)[0];
    victim.victimOf = c.label;
    const src = victim.chain[0];
    const me = c.chain[0];
    if (c.label === "DUPLICATE_DOCUMENT") {
      // Another institution re-uploads the victim's FDR copy and claims what it says.
      Object.assign(me, { truth: src.truth, doc: src.doc, claimed: src.claimed, copyDocOf: src.id });
    }
    if (c.label === "DUPLICATE_FDR_NUMBER") {
      const d = { ...me.truth, bank: src.truth.bank, no: src.truth.no, amountL: 50 };
      Object.assign(me, { truth: d, doc: d, claimed: d });
    }
    if (c.label === "NEAR_DUPLICATE") {
      let no = src.truth.no;
      for (let step = 1; no === src.truth.no || used.has(no); step++) no = `${src.truth.no.slice(0, -1)}${(Number(src.truth.no.slice(-1)) + step) % 10}`;
      used.add(no);
      const d = { ...me.truth, bank: src.truth.bank, no };
      Object.assign(me, { truth: d, doc: d, claimed: d });
    }
  }
  return cases;
}

const pdfSpec = (d: Deposit, depositor: string) => ({
  bankName: d.bank.name,
  branch: d.bank.branch,
  ifsc: d.bank.ifsc,
  fdrNumber: d.no,
  amountPaise: L(d.amountL),
  issueDate: d.issue,
  maturityDate: d.maturity,
  interestRate: "6.80",
  depositor,
  lienMarked: d.lien,
});

const values = (d: Deposit): Record<FieldKey, FieldValue> => ({
  bankName: d.bank.name,
  fdrNumber: d.no,
  amount: L(d.amountL),
  issueDate: d.issue,
  maturityDate: d.maturity,
  lienNoted: d.lien,
});

function pct(n: number, d: number) {
  return d === 0 ? null : Math.round((n / d) * 1000) / 10;
}
function quantile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10 : 0;
}

async function detectionPhase(cases: Case[]) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = new Map<string, Uint8Array>();
  const extracted = new Map<string, ReturnType<typeof parseFdrText>>();
  const extractMs: number[] = [];
  const fieldHits: Record<string, { ok: number; n: number }> = {};

  // 1. documents: a real PDF per instrument (or the copied bytes) and real text extraction
  const all = cases.flatMap((c) => c.chain.map((i) => ({ c, i })));
  for (const { c, i } of all) bytes.set(i.id, await makeFdrPdf(pdfSpec(i.doc, `Trust of ${c.institutionId}`)));
  for (const { i } of all) if (i.copyDocOf) bytes.set(i.id, bytes.get(i.copyDocOf)!);
  for (const { i } of all) {
    const t0 = performance.now();
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes.get(i.id)!)), { mergePages: true });
    const ex = parseFdrText(text);
    extractMs.push(performance.now() - t0);
    extracted.set(i.id, ex);
    const want = values(i.doc);
    for (const k of Object.keys(want) as FieldKey[]) {
      fieldHits[k] ??= { ok: 0, n: 0 };
      fieldHits[k].n++;
      if (normalize(k, ex.fields[k].value) === normalize(k, want[k])) fieldHits[k].ok++;
    }
  }

  // 2. three tiers per instrument: claimed (institution), extracted (parser), confirmed (sandbox bank book)
  const fieldsOf = (i: Instr): TierFields => {
    const claimed = values(i.claimed);
    const truth = values(i.truth);
    const ex = extracted.get(i.id)!;
    const confirmed = (k: FieldKey): Confirmed => ({ value: truth[k], source: k === "lienNoted" ? "BANK_PORTAL_MOCK" : "AA_MOCK", fetchedAt: NOW.toISOString(), ref: "eval" });
    return Object.fromEntries(
      (Object.keys(claimed) as FieldKey[]).map((k) => [
        k,
        makeField(k, claimed[k], ex.fields[k].value === null ? null : { value: ex.fields[k].value, confidence: ex.fields[k].confidence, documentId: i.id, bbox: null, engine: ex.engine }, confirmed(k)),
      ]),
    ) as TierFields;
  };
  const node = (i: Instr): ChainNode => ({
    id: i.id,
    code: i.id,
    type: "FDR",
    status: i.status,
    predecessorId: i.predecessorId,
    amountPaise: BigInt(L(i.truth.amountL)),
    issueDate: i.truth.issue,
    maturityDate: i.truth.maturity,
    lienNoted: i.truth.lien,
  });
  const candidates: DupCandidate[] = all.map(({ c, i }) => {
    const f = fieldsOf(i);
    return { id: i.id, code: i.id, type: "FDR", institutionId: c.institutionId, institutionName: c.institutionId, bankName: f.bankName, fdrNumber: f.fdrNumber, amount: f.amount, issueDate: f.issueDate, docHashes: [sha256Hex(Buffer.from(bytes.get(i.id)!))] };
  });

  // 3. detection on each case's latest instrument
  const detectMs: number[] = [];
  const rows = cases.map((c) => {
    const latest = c.chain[c.chain.length - 1];
    const t0 = performance.now();
    const found = detectDiscrepancies({
      instrument: {
        id: latest.id,
        type: "FDR",
        institutionId: c.institutionId,
        fields: fieldsOf(latest),
        requiredAmountPaise: BigInt(L(c.requiredL)),
        affidavitDueAt: null,
        hasAffidavit: true,
        docHashes: [sha256Hex(Buffer.from(bytes.get(latest.id)!))],
      },
      others: candidates.filter((o) => o.id !== latest.id),
      chain: analyzeChain(buildChain(c.chain.map(node), latest.id)),
      now: NOW,
    });
    detectMs.push(performance.now() - t0);
    const codes = [...new Set(found.map((d) => d.code))].sort();
    // A copied-from clean case should carry its partner's findings; an independent clean case should carry none.
    const exp = EXPECTED[c.victimOf ?? c.label];
    const ok = new Set([exp.primary, ...exp.allowed].filter(Boolean));
    return { id: c.id, label: c.label, victimOf: c.victimOf ?? null, codes, detected: exp.primary ? codes.includes(exp.primary) : codes.length === 0, falseAlarms: codes.filter((x) => !ok.has(x)) };
  });

  const byLabel = MIX.map(([label]) => {
    const rs = rows.filter((r) => r.label === label);
    const hit = rs.filter((r) => r.detected).length;
    if (label === "FORMAT_VARIANT") {
      const flagged = rs.filter((r) => r.codes.length > 0).length;
      return { label, n: rs.length, flagged, falsePositiveRate: pct(flagged, rs.length) };
    }
    if (label !== "CLEAN") return { label, expected: EXPECTED[label].primary, n: rs.length, detected: hit, recall: pct(hit, rs.length) };
    const independent = rs.filter((r) => !r.victimOf);
    const flagged = independent.filter((r) => r.codes.length > 0).length;
    return { label, n: independent.length, flagged, falsePositiveRate: pct(flagged, independent.length) };
  });
  const victims = rows.filter((r) => r.victimOf);
  const defective = rows.filter((r) => EXPECTED[r.label].primary);
  const alarms = rows.reduce((s, r) => s + r.codes.length, 0);
  const wrongAlarms = rows.reduce((s, r) => s + r.falseAlarms.length, 0);
  return {
    byLabel,
    overall: {
      defectiveCases: defective.length,
      detected: defective.filter((r) => r.detected).length,
      recall: pct(defective.filter((r) => r.detected).length, defective.length),
      cleanCases: rows.filter((r) => !EXPECTED[r.label].primary && !r.victimOf).length,
      cleanFlagged: rows.filter((r) => !EXPECTED[r.label].primary && !r.victimOf && r.codes.length > 0).length,
      partnerCases: victims.length,
      partnersFlagged: victims.filter((r) => r.detected).length,
      alarms,
      wrongAlarms,
      alarmPrecision: pct(alarms - wrongAlarms, alarms),
    },
    extractionAccuracy: Object.fromEntries(Object.entries(fieldHits).map(([k, v]) => [k, pct(v.ok, v.n)])),
    timingMs: {
      extractionP50: quantile(extractMs, 0.5),
      extractionP95: quantile(extractMs, 0.95),
      detectionP50: quantile(detectMs, 0.5),
      detectionP95: quantile(detectMs, 0.95),
      documents: extractMs.length,
    },
    misses: rows.filter((r) => !r.detected || r.falseAlarms.length).map((r) => ({ id: r.id, label: r.label, victimOf: r.victimOf, codes: r.codes, falseAlarms: r.falseAlarms })),
  };
}

/** Drive cases through the real services: submit → bank confirmation → officer decision. */
async function workflowPhase(cases: Case[], count = 30) {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) throw new Error("--workflow needs TEST_DATABASE_URL (a throwaway database that differs from DATABASE_URL)");
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, DEMO_MODE: "1", ANTHROPIC_API_KEY: "", BLOB_READ_WRITE_TOKEN: "" };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
  Object.assign(process.env, env);

  const { db } = await import("../lib/db");
  const { storeFile } = await import("../lib/storage");
  const { extractFdr } = await import("../lib/extract");
  const { createSubmission, fetchBankConfirmation, performCaseAction } = await import("../lib/services/workflow");
  const rakesh = await db.user.findUniqueOrThrow({ where: { email: "accounts@gangavalley.demo" } });
  const arjun = await db.user.findUniqueOrThrow({ where: { email: "dd.regulation@aicte.demo" } });
  const banks = await db.bank.findMany();

  // Clean deposits should be accepted; amount mismatches should go back to the institution.
  const picked = [...cases.filter((c) => c.label === "CLEAN").slice(0, Math.round(count * 0.66)), ...cases.filter((c) => c.label === "AMOUNT_MISMATCH").slice(0, count - Math.round(count * 0.66))];
  const runs = [];
  for (const c of picked) {
    const i = c.chain[0];
    const t0 = performance.now();
    let outcome = "ERROR";
    try {
      const bank = banks.find((b) => b.name === i.truth.bank.name)!;
      await db.bankDepositRecord.create({
        data: {
          bankId: bank.id,
          fdrNumber: i.truth.no,
          accountHolder: "Ganga Valley Educational Society",
          inFavourOf: "Member Secretary, AICTE",
          principal: L(i.truth.amountL),
          openingDate: new Date(`${i.truth.issue}T00:00:00Z`),
          maturityDate: new Date(`${i.truth.maturity}T00:00:00Z`),
          interestRate: "6.80",
          lienMarked: i.truth.lien,
          lienHolder: i.truth.lien ? "Member Secretary, AICTE" : null,
          status: "ACTIVE",
        },
      });
      const buf = Buffer.from(await makeFdrPdf(pdfSpec(i.doc, "Ganga Valley Educational Society")));
      const file = await storeFile(db, buf, `${i.doc.no}.pdf`, "application/pdf");
      const extraction = await extractFdr(buf, "application/pdf");
      const ids = await createSubmission(rakesh, {
        type: "FDR",
        caseType: "NEW_SUBMISSION",
        predecessorId: null,
        claimed: { bankName: i.claimed.bank.name, fdrNumber: i.claimed.no, amountRupees: i.claimed.amountL * 100_000, issueDate: i.claimed.issue, maturityDate: i.claimed.maturity, lienNoted: i.claimed.lien },
        upload: { fileId: file.id, extraction },
        affidavitFileId: null,
      });
      await fetchBankConfirmation(arjun, ids.instrumentId);
      const high = await db.discrepancy.count({ where: { instrumentId: ids.instrumentId, resolvedAt: null, severity: "HIGH" } });
      if (high) await performCaseAction(arjun, ids.caseId, "REQUEST_CLARIFICATION", "Bank-confirmed values differ from the claim");
      else await performCaseAction(arjun, ids.caseId, "ACCEPT", null);
      outcome = (await db.case.findUniqueOrThrow({ where: { id: ids.caseId } })).status;
    } catch (e) {
      outcome = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
    const expected = c.label === "CLEAN" ? "CLOSED" : "CLARIFICATION_REQUIRED";
    runs.push({ id: c.id, label: c.label, expected, outcome, ok: outcome === expected, ms: performance.now() - t0 });
  }
  const { verifyEventChain } = await import("../lib/events");
  const chain = await verifyEventChain(db);
  await db.$disconnect();
  const ok = runs.filter((r) => r.ok).length;
  return {
    cases: runs.length,
    completedAsExpected: ok,
    completionRate: pct(ok, runs.length),
    perCaseMs: { p50: quantile(runs.map((r) => r.ms), 0.5), p95: quantile(runs.map((r) => r.ms), 0.95) },
    auditChainIntact: chain.ok,
    failures: runs.filter((r) => !r.ok).map(({ id, label, expected, outcome }) => ({ id, label, expected, outcome })),
  };
}

function report(r: Results): string {
  const o = r.detection.overall;
  const lines = [
    "# Evaluation report",
    "",
    `Generated ${r.generatedAt} · commit \`${r.commit}\` · seed ${r.seed} · ${r.cases} cases. Reproduce with \`npm run eval\`${r.workflow ? " (`-- --workflow` for the workflow phase)" : ""}.`,
    "",
    "Every case has a generated PDF, real text extraction (the local parser, so no API is involved) and the production detection engines. Bank values come from a sandbox bank book, as in the demo.",
    "",
    "## Detection",
    "",
    `- **Recall:** ${o.detected} of ${o.defectiveCases} planted defects caught (${o.recall}%).`,
    `- **False positives on clean deposits:** ${o.cleanFlagged} of ${o.cleanCases} correct deposits raised any finding (including ${r.detection.byLabel.find((b) => b.label === "FORMAT_VARIANT")?.n ?? 0} typed with different case, spacing, dashes or "Ltd.").`,
    `- **Both sides of a duplicate:** ${o.partnersFlagged} of ${o.partnerCases} copied-from deposits were flagged as the partner too.`,
    `- **Alarm precision:** ${o.alarms - o.wrongAlarms} of ${o.alarms} findings were explained by the planted defect (${o.alarmPrecision}%).`,
    "",
    "| Planted defect | Expected finding | Cases | Caught | Recall |",
    "|---|---|---|---|---|",
    ...r.detection.byLabel.filter((b) => "expected" in b).map((b) => `| ${b.label} | \`${"expected" in b ? b.expected : ""}\` | ${b.n} | ${"detected" in b ? b.detected : ""} | ${"recall" in b ? b.recall : ""}% |`),
    "",
    "## Extraction accuracy (local parser vs the PDF's printed values)",
    "",
    "| Field | Accuracy |",
    "|---|---|",
    ...Object.entries(r.detection.extractionAccuracy).map(([k, v]) => `| ${k} | ${v}% |`),
    "",
    "## Processing time",
    "",
    `- Text extraction per document: p50 ${r.detection.timingMs.extractionP50} ms, p95 ${r.detection.timingMs.extractionP95} ms (${r.detection.timingMs.documents} documents).`,
    `- Detection per instrument (against all ${r.cases} others): p50 ${r.detection.timingMs.detectionP50} ms, p95 ${r.detection.timingMs.detectionP95} ms.`,
  ];
  if (r.workflow) {
    const w = r.workflow;
    lines.push(
      "",
      "## Workflow completion (real services + Postgres)",
      "",
      `Submit → sandbox bank confirmation → officer decision, for ${w.cases} cases (clean ones should be accepted, amount mismatches sent back for clarification).`,
      "",
      `- **Completed as expected:** ${w.completedAsExpected} of ${w.cases} (${w.completionRate}%).`,
      `- **Time per case:** p50 ${w.perCaseMs.p50} ms, p95 ${w.perCaseMs.p95} ms (local PGlite database, which serves one connection at a time).`,
      `- **Audit hash chain after the run:** ${w.auditChainIntact ? "intact" : "BROKEN"}.`,
    );
  }
  if (r.detection.misses.length) {
    lines.push("", "## Misses and false alarms", "", "| Case | Label | Findings | Unexplained |", "|---|---|---|---|");
    lines.push(...r.detection.misses.map((m) => `| ${m.id} | ${m.victimOf ? `CLEAN (copied by ${m.victimOf})` : m.label} | ${m.codes.join(", ") || "none"} | ${m.falseAlarms.join(", ") || "—"} |`));
  }
  lines.push(
    "",
    "## What the evaluation changed",
    "",
    "- An earlier run flagged 2 of 70 correct deposits as near-duplicates: two institutions' unrelated ₹50 L FDRs opened at the same bank on the same day. Deposit amounts are standard, so same-day collisions are common. The rule now also needs the numbers to be within three edits; the planted near-duplicates are still all caught.",
  );
  lines.push("", "## Limits", "", "- The dataset is synthetic and the documents are clean, machine-generated PDFs; scanned or photographed documents (OCR) are not covered yet.", "- Bank values come from the sandbox bank book, not a live Account Aggregator.");
  return `${lines.join("\n")}\n`;
}

type Results = {
  generatedAt: string;
  commit: string;
  seed: number;
  cases: number;
  detection: Awaited<ReturnType<typeof detectionPhase>>;
  workflow: Awaited<ReturnType<typeof workflowPhase>> | null;
};

async function main() {
  const cases = buildDataset();
  const detection = await detectionPhase(cases);
  const workflow = process.argv.includes("--workflow") ? await workflowPhase(cases) : null;
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {}
  const results: Results = { generatedAt: new Date().toISOString(), commit, seed: SEED, cases: cases.length, detection, workflow };
  writeFileSync("eval/results.json", `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync("eval/REPORT.md", report(results));
  console.log(report(results));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
