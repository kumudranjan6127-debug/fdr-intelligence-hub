// Unit tests for the pure engines, using fixtures that mirror the planted defects in prisma/seed.ts.
import { describe, expect, it } from "vitest";
import { analyzeChain, buildChain, type ChainNode } from "@/lib/chain";
import { detectDiscrepancies } from "@/lib/discrepancy";
import { canonicalJson, hashEvent, sha256Hex } from "@/lib/hash";
import { makeField, normalize, valuesEqual, type TierFields } from "@/lib/provenance";
import { affidavitPenalty, releasePenalty, requiredAmount, penaltyAmount } from "@/lib/rules";
import { riskScore } from "@/lib/risk";
import { CASE_TRANSITIONS, assertCaseTransition, availableActions, canPerform, holdingStatus } from "@/lib/transitions";
import { whyPending } from "@/lib/whyPending";
import { parseFdrText } from "@/lib/extract";
import { makeFdrPdf } from "@/lib/samples";

const L = (lakh: number) => String(lakh * 100_000 * 100);
const NOW = new Date("2026-10-25T00:00:00Z");

function fields(o: Partial<Record<keyof TierFields, [unknown, unknown?, unknown?]>>): TierFields {
  const base: Record<keyof TierFields, [unknown, unknown?, unknown?]> = {
    bankName: ["Bharat Union Bank", "Bharat Union Bank"],
    fdrNumber: ["BUB123", "BUB123"],
    amount: [L(50), L(50)],
    issueDate: ["2026-01-01", "2026-01-01"],
    maturityDate: ["2029-01-01", "2029-01-01"],
    lienNoted: [true, true],
    ...o,
  };
  return Object.fromEntries(
    Object.entries(base).map(([k, [c, e, conf]]) => [
      k,
      makeField(
        k as keyof TierFields,
        c as never,
        e === undefined ? null : { value: e as never, confidence: 0.9, documentId: "d1", bbox: null },
        conf === undefined ? null : { value: conf as never, source: "AA_MOCK", fetchedAt: NOW.toISOString() },
      ),
    ]),
  ) as TierFields;
}

const baseInput = (f: TierFields, extra: Partial<Parameters<typeof detectDiscrepancies>[0]["instrument"]> = {}) => ({
  instrument: { id: "i1", type: "FDR" as const, institutionId: "inst1", fields: f, requiredAmountPaise: BigInt(L(50)), affidavitDueAt: null, hasAffidavit: true, ...extra },
  others: [],
  now: NOW,
});

describe("provenance", () => {
  it("normalises amounts, dates, FDR numbers and bank names", () => {
    expect(normalize("fdrNumber", "bub-123 ")).toBe("BUB123");
    expect(valuesEqual("bankName", "Bharat Union Bank Ltd.", "BHARAT UNION BANK (AICTE online collection)")).toBe(true);
    expect(valuesEqual("amount", "5000000", "05000000")).toBe(true);
  });
  it("computes field status across tiers", () => {
    expect(makeField("amount", L(50), { value: L(45), confidence: 0.9, documentId: null, bbox: null }).status).toBe("MISMATCH");
    expect(makeField("amount", L(50), { value: L(50), confidence: 0.9, documentId: null, bbox: null }).status).toBe("MATCH");
    expect(makeField("amount", L(50), null, { value: L(50), source: "AA_MOCK", fetchedAt: "" }).status).toBe("CONFIRMED");
    expect(makeField("amount", L(50)).status).toBe("UNVERIFIED");
  });
});

describe("rules", () => {
  it("doubles the required amount for leased premises and exempts government institutions", () => {
    expect(requiredAmount({ programmes: 2, isLeased: false, isGovernment: false })).toBe(BigInt(L(50)));
    expect(requiredAmount({ programmes: 2, isLeased: true, isGovernment: false })).toBe(BigInt(L(100)));
    expect(requiredAmount({ programmes: 2, isLeased: true, isGovernment: true })).toBe(0n);
  });
  it("applies the late-affidavit tiers", () => {
    const intimation = new Date("2026-04-01T00:00:00Z");
    expect(affidavitPenalty(intimation, new Date("2026-04-10T00:00:00Z")).kind).toBe("ON_TIME");
    expect(affidavitPenalty(intimation, new Date("2026-05-20T00:00:00Z")).pct).toBe(10);
    expect(affidavitPenalty(intimation, new Date("2026-07-15T00:00:00Z")).pct).toBe(20);
    expect(affidavitPenalty(intimation, new Date("2026-08-15T00:00:00Z")).kind).toBe("WITHDRAWN");
  });
  it("picks the highest single release deduction with its rule reference", () => {
    const eoa = releasePenalty({ lastEoaYear: 2020, asOf: NOW, lateAffidavit: true, openHighDiscrepancies: 0 });
    expect(eoa.pct).toBe(50);
    expect(eoa.ruleRef).toMatch(/§2\.16/);
    expect(releasePenalty({ lastEoaYear: 2026, asOf: NOW, lateAffidavit: true, openHighDiscrepancies: 0 }).pct).toBe(10);
    expect(releasePenalty({ lastEoaYear: 2026, asOf: NOW, lateAffidavit: false, openHighDiscrepancies: 0 }).pct).toBe(0);
    expect(penaltyAmount(BigInt(L(50)), 10)).toBe(BigInt(L(5)));
  });
});

describe("discrepancy detection — planted seed defects", () => {
  const codes = (f: TierFields, extra = {}) => detectDiscrepancies(baseInput(f, extra)).map((d) => d.code);

  it("flags claimed ≠ extracted amount (Ganga Valley) and the resulting shortfall", () => {
    const c = codes(fields({ amount: [L(50), L(45)] }));
    expect(c).toContain("CLAIMED_VS_EXTRACTED");
    expect(c).toContain("BELOW_REQUIRED");
  });
  it("flags maturity before issue (Aravalli legacy record)", () => {
    expect(codes(fields({ issueDate: ["2025-09-20"], maturityDate: ["2024-09-20"] }))).toContain("MATURITY_BEFORE_ISSUE");
  });
  it("flags amount below required (Malabar, leased)", () => {
    expect(codes(fields({}), { requiredAmountPaise: BigInt(L(100)) })).toEqual(["BELOW_REQUIRED"]);
  });
  it("flags a missing affidavit after the deadline (Deccan Plateau)", () => {
    expect(codes(fields({}), { hasAffidavit: false, affidavitDueAt: new Date("2026-09-27T00:00:00Z") })).toEqual(["MISSING_AFFIDAVIT"]);
  });
  it("flags lien not noted using the most independent evidence (Kaveri)", () => {
    const c = codes(fields({ lienNoted: [true, false] }));
    expect(c).toContain("LIEN_NOT_NOTED");
    expect(c).toContain("CLAIMED_VS_EXTRACTED");
  });
  it("flags a duplicate FDR number across institutions (Hooghly ↔ Sundarbans)", () => {
    const d = detectDiscrepancies({
      ...baseInput(fields({ bankName: ["Konkan Mercantile Bank"], fdrNumber: ["KMB2022118834"] })),
      others: [{ id: "i2", code: "INS-2", institutionId: "inst2", institutionName: "Sundarbans", bankName: { claimed: "Konkan Mercantile Bank" }, fdrNumber: { claimed: "KMB2022118834" } }],
    });
    expect(d.map((x) => x.code)).toContain("DUPLICATE_FDR_NUMBER");
  });
  it("reports nothing for a clean, bank-confirmed instrument", () => {
    expect(codes(fields({ amount: [L(50), L(50), L(50)] }))).toEqual([]);
  });
});

describe("renewal chain X-ray", () => {
  const n = (id: string, pred: string | null, amountL: number, issue: string, maturity: string, lien = true): ChainNode => ({
    id,
    code: id,
    type: "FDR",
    status: "ACTIVE",
    predecessorId: pred,
    amountPaise: BigInt(L(amountL)),
    issueDate: issue,
    maturityDate: maturity,
    lienNoted: lien,
  });

  it("finds the 47-day gap (Shivneri)", () => {
    const chain = buildChain(
      [n("A1", null, 50, "2018-08-17", "2020-08-16"), n("A2", "A1", 50, "2020-08-16", "2022-08-07"), n("A3", "A2", 50, "2022-09-23", "2024-09-22"), n("A4", "A3", 50, "2024-09-22", "2026-12-09")],
      "A2",
    );
    expect(chain.map((c) => c.id)).toEqual(["A1", "A2", "A3", "A4"]);
    const a = analyzeChain(chain);
    expect(a.gaps).toHaveLength(1);
    expect(a.gaps[0].days).toBe(47);
    expect(a.lateRenewals).toBe(1);
  });
  it("finds the ₹50 L → ₹45 L drop (Narmada) and the lien break (Kaveri)", () => {
    const drop = analyzeChain([n("B1", null, 50, "2020-01-01", "2023-01-01"), n("B2", "B1", 45, "2023-01-01", "2026-01-01")]);
    expect(drop.amountDrops).toHaveLength(1);
    const lien = analyzeChain([n("C1", null, 50, "2020-01-01", "2023-01-01"), n("C2", "C1", 50, "2023-01-01", "2026-01-01", false)]);
    expect(lien.lienBreaks.map((b) => b.id)).toEqual(["C2"]);
  });
});

describe("risk", () => {
  it("follows the brief's formula and caps at 100", () => {
    expect(riskScore({ lateRenewals: 0, gapDays: 0, openDiscrepancies: 2, overdueCases: 0 }).score).toBe(40);
    expect(riskScore({ lateRenewals: 1, gapDays: 47, openDiscrepancies: 1, overdueCases: 0 }).score).toBe(100);
    expect(riskScore({ lateRenewals: 0, gapDays: 15, openDiscrepancies: 0, overdueCases: 1 }).score).toBe(25);
  });
});

describe("hash", () => {
  it("is key-order independent and detects any change", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    const e = { prevSha256: null, instrumentId: "i", caseId: null, actorId: "u", actorRole: "BUREAU", action: "X", before: null, after: { s: 1 }, reason: null, createdAt: NOW };
    expect(hashEvent(e)).toBe(hashEvent({ ...e }));
    expect(hashEvent(e)).not.toBe(hashEvent({ ...e, after: { s: 2 } }));
    const bytes = Buffer.from("FDR copy");
    const tampered = Buffer.from(bytes);
    tampered[0] ^= 1;
    expect(sha256Hex(bytes)).not.toBe(sha256Hex(tampered));
  });
});

describe("state machine", () => {
  it("only allows listed transitions", () => {
    expect(() => assertCaseTransition("SUBMITTED", "NOC_ISSUED")).toThrow();
    expect(() => assertCaseTransition("CLEARANCES_PENDING", "PENALTY_ASSESSMENT")).not.toThrow();
    for (const from of Object.keys(CASE_TRANSITIONS)) expect(Array.isArray(CASE_TRANSITIONS[from as keyof typeof CASE_TRANSITIONS])).toBe(true);
  });
  it("enforces roles per action", () => {
    expect(canPerform("ACCEPT", { status: "SUBMITTED", type: "NEW_SUBMISSION" }, "BUREAU")).toBe(true);
    expect(canPerform("ACCEPT", { status: "SUBMITTED", type: "NEW_SUBMISSION" }, "INSTITUTION")).toBe(false);
    expect(canPerform("ISSUE_NOC", { status: "DECISION_RECORDED", type: "RELEASE" }, "BUREAU")).toBe(false);
    expect(availableActions({ status: "NOC_ISSUED", type: "RELEASE" }, "BANK")).toEqual(["BANK_CONFIRM"]);
  });
  it("derives holding status from maturity", () => {
    expect(holdingStatus("2026-11-14", NOW, 90)).toBe("EXPIRING");
    expect(holdingStatus("2027-11-14", NOW, 90)).toBe("ACTIVE");
    expect(holdingStatus("2026-10-25", NOW, 90)).toBe("MATURED");
  });
});

describe("why pending", () => {
  it("names the blocking cell for a release stuck at Legal (Konkan)", () => {
    const w = whyPending({
      case: { type: "RELEASE", status: "CLEARANCES_PENDING", statusChangedAt: new Date("2026-10-07T00:00:00Z"), blockingReason: null, penaltyPct: null, penaltyRuleRef: null },
      instrumentType: "FDR",
      clearances: [
        { cell: "FINANCE", status: "CLEARED", decidedAt: new Date("2026-10-13T00:00:00Z") },
        { cell: "GRIEVANCE", status: "CLEARED", decidedAt: new Date("2026-10-16T00:00:00Z") },
        { cell: "LEGAL", status: "PENDING", decidedAt: null },
      ],
      documentKinds: ["FDR_COPY", "AFFIDAVIT_6", "LOA_EOA"],
      openDiscrepancies: [],
      now: NOW,
      slaDays: 15,
    });
    expect(w.blockingStep).toBe("Cell clearances pending: Legal");
    expect(w.ownerRole).toBe("CELL");
    expect(w.daysPending).toBe(18);
    expect(w.slaBreached).toBe(true);
    expect(w.evidence.some((e) => e.startsWith("Finance cell cleared"))).toBe(true);
  });
});

describe("local extraction fallback", () => {
  it("reads every field back from a generated specimen FDR", async () => {
    const bytes = await makeFdrPdf({
      bankName: "Deccan Commercial Bank",
      branch: "Camp Branch, Pune",
      ifsc: "DCBK0000412",
      fdrNumber: "DCB2024005530",
      amountPaise: L(45),
      issueDate: "2024-09-22",
      maturityDate: "2026-12-09",
      interestRate: "6.80",
      depositor: "Shivneri Education Trust",
      lienMarked: false,
    });
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true });
    const r = parseFdrText(text);
    expect(r.fields.fdrNumber.value).toBe("DCB2024005530");
    expect(r.fields.amount.value).toBe(L(45));
    expect(r.fields.issueDate.value).toBe("2024-09-22");
    expect(r.fields.maturityDate.value).toBe("2026-12-09");
    expect(r.fields.lienNoted.value).toBe(false);
    expect(valuesEqual("bankName", r.fields.bankName.value, "Deccan Commercial Bank")).toBe(true);
  });
});
