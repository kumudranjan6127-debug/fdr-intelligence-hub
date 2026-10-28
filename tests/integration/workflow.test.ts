// End-to-end workflow through the real services and database: submission, discrepancy identification,
// bank confirmation, clarification, multi-role release, NOC issuance and verification, bank confirmation,
// plus role, evidence and duplicate controls. Runs against the seeded test database (see global-setup.ts).
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyEventChain } from "@/lib/events";
import { extractFdr } from "@/lib/extract";
import { storeFile } from "@/lib/storage";
import { runMaturityJob } from "@/lib/services/maturity";
import { verifyNoc } from "@/lib/services/noc";
import { createSubmission, decideClearance, fetchBankConfirmation, performCaseAction } from "@/lib/services/workflow";
import { tierFieldsOf } from "@/lib/provenance";

const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
const open = (instrumentId: string) => db.discrepancy.findMany({ where: { instrumentId, resolvedAt: null } });
const SAMPLE = "public/samples/sample-fdr-45L-mismatch.pdf";

async function submit(as: User, fdrNumber = "BUB2026160022") {
  const buf = readFileSync(SAMPLE);
  const file = await storeFile(db, buf, "sample-fdr-45L-mismatch.pdf", "application/pdf");
  const extraction = await extractFdr(buf, "application/pdf");
  return createSubmission(as, {
    type: "FDR",
    caseType: "NEW_SUBMISSION",
    predecessorId: null,
    claimed: { bankName: "Bharat Union Bank", fdrNumber, amountRupees: 5_000_000, issueDate: "2026-10-21", maturityDate: "2029-10-21", lienNoted: true },
    upload: { fileId: file.id, extraction },
    affidavitFileId: null,
  });
}

let rakesh: User, arjun: User;
beforeAll(async () => {
  [rakesh, arjun] = await Promise.all([user("accounts@gangavalley.demo"), user("dd.regulation@aicte.demo")]);
});
afterAll(() => db.$disconnect());

describe("new submission → discrepancy → bank confirmation → clarification", () => {
  let ids: { instrumentId: string; caseId: string };

  it("an institution submits; the AI-extracted ₹45 L is flagged against the claimed ₹50 L", async () => {
    ids = await submit(rakesh);
    const ins = await db.instrument.findUniqueOrThrow({ where: { id: ids.instrumentId } });
    const f = tierFieldsOf(ins);
    expect(f.amount.claimed).toBe("500000000");
    expect(f.amount.extracted?.value).toBe("450000000");
    expect(f.amount.confirmed).toBeNull();
    expect((await db.case.findUniqueOrThrow({ where: { id: ids.caseId } })).status).toBe("SUBMITTED");
    const codes = (await open(ids.instrumentId)).map((d) => `${d.code}:${d.field}`);
    expect(codes).toContain("CLAIMED_VS_EXTRACTED:amount");
  });

  it("only officers or the holding bank may fetch bank confirmation", async () => {
    await expect(fetchBankConfirmation(rakesh, ids.instrumentId)).rejects.toThrow(/Not allowed/);
    const otherBank = await user("bm.pune@dcb.demo");
    await expect(fetchBankConfirmation(otherBank, ids.instrumentId)).rejects.toThrow(/Not held at your bank/);
  });

  it("the officer fetches bank confirmation; values are tagged as sandbox and contradict the claim", async () => {
    await fetchBankConfirmation(arjun, ids.instrumentId);
    const f = tierFieldsOf(await db.instrument.findUniqueOrThrow({ where: { id: ids.instrumentId } }));
    expect(f.amount.confirmed).toMatchObject({ value: "450000000", source: "AA_MOCK" });
    expect(f.lienNoted.confirmed?.source).toBe("BANK_PORTAL_MOCK");
    const amount = (await open(ids.instrumentId)).find((d) => d.code === "CLAIMED_VS_CONFIRMED" && d.field === "amount");
    expect(amount?.severity).toBe("HIGH");
  });

  it("a clarification needs a reason, then moves the case to the institution", async () => {
    await expect(performCaseAction(arjun, ids.caseId, "REQUEST_CLARIFICATION", "  ")).rejects.toThrow(/reason is mandatory/);
    await performCaseAction(arjun, ids.caseId, "REQUEST_CLARIFICATION", "Bank and document both say ₹45 L; correct the claim or top up.");
    expect((await db.case.findUniqueOrThrow({ where: { id: ids.caseId } })).status).toBe("CLARIFICATION_REQUIRED");
    await expect(performCaseAction(arjun, ids.caseId, "ACCEPT", null)).rejects.toThrow(/not allowed/);
  });

  it("re-uploading the same document as another institution is caught as a duplicate on both sides", async () => {
    const anita = await user("registrar@shivneri.demo");
    const dup = await submit(anita);
    const mine = (await open(dup.instrumentId)).map((d) => `${d.code}:${d.severity}`);
    expect(mine).toContain("DUPLICATE_DOCUMENT:HIGH");
    expect(mine).toContain("DUPLICATE_FDR_NUMBER:HIGH");
    const theirs = (await open(ids.instrumentId)).map((d) => d.code);
    expect(theirs).toEqual(expect.arrayContaining(["DUPLICATE_DOCUMENT", "DUPLICATE_FDR_NUMBER"]));
  });
});

describe("release: clearances → penalty → approval → NOC → verification → bank confirmation", () => {
  let caseId: string;
  let nocCode: string;

  beforeAll(async () => {
    caseId = (await db.case.findFirstOrThrow({ where: { type: "RELEASE", status: "CLEARANCES_PENDING" } })).id;
  });

  it("only the matching cell can clear, and clearing applies the rule-based penalty", async () => {
    const finance = await user("finance.cell@aicte.demo");
    await expect(decideClearance(finance, caseId, "LEGAL", "CLEARED", null)).rejects.toThrow(/Only the LEGAL cell/);
    await decideClearance(await user("legal.cell@aicte.demo"), caseId, "LEGAL", "CLEARED", "No pending litigation");
    const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(c.status).toBe("PENALTY_ASSESSMENT");
    expect(Number(c.penaltyPct)).toBe(10);
    expect(c.penaltyRuleRef).toMatch(/APH 2024-27/);
  });

  it("an officer cannot approve a release; the competent authority can and issues the NOC", async () => {
    await expect(performCaseAction(arjun, caseId, "APPROVE_RELEASE", null)).rejects.toThrow(/not allowed/);
    const authority = await user("ms@aicte.demo");
    await performCaseAction(authority, caseId, "APPROVE_RELEASE", null);
    await performCaseAction(authority, caseId, "ISSUE_NOC", null);
    const noc = await db.noc.findFirstOrThrow({ where: { caseId }, orderBy: { issuedAt: "desc" } });
    nocCode = noc.code;
    expect((await db.case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe("NOC_ISSUED");
  });

  it("the NOC verifies, records sandbox bank evidence and detects tampering", async () => {
    const v = await verifyNoc(db, nocCode);
    expect(v.recordIntact).toBe(true);
    expect(v.documents?.every((d) => d.intact)).toBe(true);
    expect(v.noc?.payload.bankEvidence?.level).toBe("SANDBOX_ONLY");
    expect(v.noc?.payload.deduction.pct).toBe(10);

    const noc = await db.noc.findUniqueOrThrow({ where: { code: nocCode } });
    const payload = noc.payload as Record<string, unknown>;
    await db.noc.update({ where: { id: noc.id }, data: { payload: { ...payload, payableToTrustPaise: "999999999" } } });
    expect((await verifyNoc(db, nocCode)).recordIntact).toBe(false);
    await db.noc.update({ where: { id: noc.id }, data: { payload: payload as never } });
    expect((await verifyNoc(db, nocCode)).recordIntact).toBe(true);
  });

  it("the holding bank confirms the lien is lifted, which closes the case and releases the deposit", async () => {
    const c = await db.case.findUniqueOrThrow({ where: { id: caseId }, include: { instrument: true } });
    const wrongBank = await db.user.findFirstOrThrow({ where: { role: "BANK", bankId: { not: c.instrument.bankId } } });
    await expect(performCaseAction(wrongBank, caseId, "BANK_CONFIRM", null)).rejects.toThrow(/not held at your bank/);
    const bank = await db.user.findFirstOrThrow({ where: { role: "BANK", bankId: c.instrument.bankId } });
    await performCaseAction(bank, caseId, "BANK_CONFIRM", null);
    const after = await db.case.findUniqueOrThrow({ where: { id: caseId }, include: { instrument: true } });
    expect(after.status).toBe("CLOSED");
    expect(after.instrument.status).toBe("RELEASED");
  });
});

describe("evidence controls outside demo mode", () => {
  it("refuses the Mock AA sandbox", async () => {
    process.env.DEMO_MODE = "0";
    try {
      const ins = await db.instrument.findFirstOrThrow({ where: { status: "ACTIVE", type: "FDR" } });
      await expect(fetchBankConfirmation(arjun, ins.id)).rejects.toThrow(/Mock AA sandbox is disabled/);
    } finally {
      process.env.DEMO_MODE = "1";
    }
  });
});

describe("demo clock preview", () => {
  it("a maturity job run a year ahead as a dry run reports changes but writes nothing", async () => {
    const before = await Promise.all([db.reminder.count(), db.event.count(), db.instrument.groupBy({ by: ["status"], _count: true })]);
    const r = await runMaturityJob(db, new Date(Date.now() + 365 * 86_400_000), { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.statusChanges.length + r.remindersCreated.length).toBeGreaterThan(0);
    const after = await Promise.all([db.reminder.count(), db.event.count(), db.instrument.groupBy({ by: ["status"], _count: true })]);
    expect(after).toEqual(before);
  });
});

describe("audit trail", () => {
  it("every step above left an intact hash chain", async () => {
    const v = await verifyEventChain(db);
    expect(v.problem).toBeNull();
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(380);
  });
});
