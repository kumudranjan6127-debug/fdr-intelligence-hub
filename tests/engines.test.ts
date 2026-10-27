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
      others: [{ id: "i2", code: "INS-2", type: "FDR", institutionId: "inst2", institutionName: "Sundarbans", bankName: { claimed: "Konkan Mercantile Bank" }, fdrNumber: { claimed: "KMB2022118834" } }],
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

describe("auth", () => {
  it("hashes and verifies passwords", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth");
    const h = hashPassword("Demo@26265");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Demo@26265", h)).toBe(true);
    expect(verifyPassword("demo@26265", h)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(hashPassword("same")).not.toBe(hashPassword("same")); // salted
  });

  it("rejects forged, tampered and expired sessions", async () => {
    const { readSession, signSession } = await import("@/lib/auth");
    const now = Date.UTC(2026, 9, 27);
    const token = signSession({ uid: "user_a", exp: now + 1000 }, "secret");
    expect(readSession(token, "secret", now)?.uid).toBe("user_a");
    expect(readSession(token, "other-secret", now)).toBeNull();
    const [, mac] = token.split(".");
    const swapped = `${Buffer.from(JSON.stringify({ uid: "authority", exp: now + 1000 })).toString("base64url")}.${mac}`;
    expect(readSession(swapped, "secret", now)).toBeNull();
    expect(readSession(token, "secret", now + 2000)).toBeNull();
    expect(readSession("user_a", "secret", now)).toBeNull(); // the old raw-id cookie
  });

  it("gates demo sign-in on DEMO_MODE", async () => {
    const { isDemoMode, sessionSecret } = await import("@/lib/auth");
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
    expect(sessionSecret({ SESSION_SECRET: "s" })).toBe("s");
    expect(sessionSecret({ DATABASE_URL: "a" })).not.toBe(sessionSecret({ DATABASE_URL: "b" }));
    expect(() => sessionSecret({})).toThrow();
  });
});

describe("evidence controls", () => {
  const conf = (source: string) => ({ value: "x", source, fetchedAt: "2026-10-27T00:00:00Z" });
  const tf = (source: string | null, status = "CONFIRMED") =>
    Object.fromEntries(
      ["bankName", "fdrNumber", "amount", "issueDate", "maturityDate", "lienNoted"].map((k) => [k, { claimed: "x", extracted: null, confirmed: source ? conf(source) : null, status }]),
    ) as unknown as TierFields;

  it("never treats sandbox values as bank confirmation", async () => {
    const { evidenceLevel, evidenceKeys, isSandboxSource } = await import("@/lib/evidence");
    const keys = evidenceKeys("FDR");
    expect(isSandboxSource("AA_MOCK")).toBe(true);
    expect(isSandboxSource("BANK_PORTAL_MOCK")).toBe(true);
    expect(isSandboxSource(undefined)).toBe(true);
    expect(isSandboxSource("AA_LIVE")).toBe(false);
    expect(evidenceLevel(tf("AA_MOCK"), keys)).toBe("SANDBOX_ONLY");
    expect(evidenceLevel(tf("AA_LIVE"), keys)).toBe("BANK_CONFIRMED");
    expect(evidenceLevel(tf("AA_LIVE", "MISMATCH"), keys)).toBe("SANDBOX_ONLY");
    expect(evidenceLevel(tf(null, "UNVERIFIED"), keys)).toBe("NONE");
    const mixed = tf("AA_LIVE");
    mixed.lienNoted.confirmed = conf("BANK_PORTAL_MOCK") as never;
    expect(evidenceLevel(mixed, keys)).toBe("SANDBOX_ONLY");
    expect(evidenceKeys("ONLINE_DEPOSIT")).not.toContain("lienNoted");
  });

  it("blocks NOCs on sandbox evidence outside demo mode", async () => {
    const { canIssueNocOn, bankEvidence, evidenceKeys } = await import("@/lib/evidence");
    expect(canIssueNocOn("SANDBOX_ONLY", false)).toBe(false);
    expect(canIssueNocOn("NONE", false)).toBe(false);
    expect(canIssueNocOn("BANK_CONFIRMED", false)).toBe(true);
    expect(canIssueNocOn("SANDBOX_ONLY", true)).toBe(true);
    expect(bankEvidence(tf("AA_MOCK"), evidenceKeys("FDR")).note).toMatch(/not a genuine bank confirmation/);
  });

  it("tags AA values with a mock or live source", async () => {
    const { confirmedFromFI } = await import("@/lib/aa");
    const fi = {
      type: "TERM_DEPOSIT", maskedAccNumber: "X", linkedAccRef: "BUB1", profile: { holders: [] },
      summary: { accountType: "FIXED", branch: "b", ifsc: "i", openingDate: "2026-01-01", maturityDate: "2029-01-01", principalAmount: "100", interestRate: "7", tenureDays: 1, status: "ACTIVE" },
      lien: { marked: true, holder: "Member Secretary, AICTE", source: "BANK_PORTAL_MOCK" }, fip: { id: "f", name: "Bank" },
    } as const;
    expect(confirmedFromFI(fi as never, "c", true).amount?.source).toBe("AA_MOCK");
    expect(confirmedFromFI(fi as never, "c", true).lienNoted?.source).toBe("BANK_PORTAL_MOCK");
    expect(confirmedFromFI(fi as never, "c", false).amount?.source).toBe("AA_LIVE");
    expect(confirmedFromFI(fi as never, "c", false).lienNoted?.source).toBe("BANK_PORTAL");
  });
});

describe("duplicate FDR detection", () => {
  const cand = (o: Partial<import("@/lib/duplicates").DupCandidate> & { id: string }) => ({
    code: o.id.toUpperCase(),
    type: "FDR",
    institutionId: "instA",
    institutionName: "Alpha",
    bankName: { claimed: "Bharat Union Bank" },
    fdrNumber: { claimed: "BUB2026160022" },
    amount: { claimed: L(50) },
    issueDate: { claimed: "2026-10-21" },
    docHashes: [] as string[],
    ...o,
  });

  it("flags a byte-identical document on another instrument", async () => {
    const { findDuplicates } = await import("@/lib/duplicates");
    const f = findDuplicates(cand({ id: "me", fdrNumber: { claimed: "X1" }, docHashes: ["h1"] }), [cand({ id: "o", institutionId: "instB", fdrNumber: { claimed: "Y2" }, amount: { claimed: L(10) }, docHashes: ["h1"] })]);
    expect(f.map((x) => x.code)).toEqual(["DUPLICATE_DOCUMENT"]);
  });

  it("rates a cross-institution number reuse HIGH and a same-institution one MED", async () => {
    const { findDuplicates } = await import("@/lib/duplicates");
    expect(findDuplicates(cand({ id: "me" }), [cand({ id: "o", institutionId: "instB", institutionName: "Beta" })])[0]).toMatchObject({ code: "DUPLICATE_FDR_NUMBER", severity: "HIGH" });
    expect(findDuplicates(cand({ id: "me" }), [cand({ id: "o" })])[0]).toMatchObject({ code: "DUPLICATE_FDR_NUMBER", severity: "MED" });
  });

  it("ignores formatting, prefers bank-confirmed values and skips other banks", async () => {
    const { findDuplicates } = await import("@/lib/duplicates");
    const spaced = cand({ id: "o", institutionId: "instB", fdrNumber: { claimed: "wrong", confirmed: { value: "bub-2026 160022" } } });
    expect(findDuplicates(cand({ id: "me" }), [spaced]).map((x) => x.code)).toEqual(["DUPLICATE_FDR_NUMBER"]);
    expect(findDuplicates(cand({ id: "me" }), [cand({ id: "o", bankName: { claimed: "Ganga Gramin Bank" }, amount: { claimed: L(10) } })])).toEqual([]);
  });

  it("finds near duplicates: one character off, or same principal and issue date", async () => {
    const { findDuplicates } = await import("@/lib/duplicates");
    const oneOff = cand({ id: "o", institutionId: "instB", fdrNumber: { claimed: "BUB2026160023" }, amount: { claimed: L(10) } });
    expect(findDuplicates(cand({ id: "me" }), [oneOff]).map((x) => x.code)).toEqual(["NEAR_DUPLICATE_FDR"]);
    const sameTerms = cand({ id: "o", institutionId: "instB", fdrNumber: { claimed: "BUB9999999999" } });
    expect(findDuplicates(cand({ id: "me" }), [sameTerms]).map((x) => x.code)).toEqual(["NEAR_DUPLICATE_FDR"]);
  });

  it("never flags members of the same renewal chain", async () => {
    const { findDuplicates } = await import("@/lib/duplicates");
    expect(findDuplicates(cand({ id: "me", docHashes: ["h"] }), [cand({ id: "pred", docHashes: ["h"] })], new Set(["pred"]))).toEqual([]);
  });

  it("computes edit distance", async () => {
    const { levenshtein } = await import("@/lib/duplicates");
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
});
