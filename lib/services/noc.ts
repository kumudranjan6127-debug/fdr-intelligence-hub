// U4 — Verifiable NOC. The payload is hashed and anchored; /verify/:code recomputes and compares.
// Honest boundary: a matching hash proves the record is unchanged — not that the bank issued the FDR.
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { anchor, hashJson, sha256Hex } from "../hash";
import { isDemoMode } from "../auth";
import { EvidenceError } from "../errors";
import { bankEvidence, canIssueNocOn, evidenceKeys, type BankEvidence } from "../evidence";
import { effectiveValue, tierFieldsOf } from "../provenance";
import { penaltyAmount } from "../rules";
import { readFile } from "../storage";

type Db = PrismaClient | Prisma.TransactionClient;

export function newCode(prefix: string, at = new Date()) {
  return `${prefix}-${at.getUTCFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export type NocPayload = {
  code: string;
  caseCode: string;
  issuedAt: string;
  issuer: { name: string; designation: string; office: string };
  addressedTo: string;
  institution: { name: string; permanentId: string; regionalOffice: string };
  instrument: { code: string; type: string; bankName: string | null; fdrNumber: string | null; principalPaise: string };
  deduction: { pct: number; amountPaise: string; ruleRef: string | null };
  payableToTrustPaise: string;
  interest: string;
  documents: { kind: string; sha256: string }[];
  /** What the bank values rest on. Absent on NOCs issued before evidence controls existed. */
  bankEvidence?: BankEvidence;
};

export async function issueNoc(tx: Db, caseId: string, issuer: { id: string; name: string; designation: string | null }, at = new Date()) {
  const c = await tx.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { instrument: { include: { institution: true, documents: true } } },
  });
  const ins = c.instrument;
  const f = tierFieldsOf(ins);
  const principal = BigInt(String(effectiveValue(f.amount) ?? "0"));
  const pct = c.penaltyPct ? Number(c.penaltyPct) : 0;
  const deduction = penaltyAmount(principal, pct);
  const evidence = bankEvidence(f, evidenceKeys(ins.type));
  if (!canIssueNocOn(evidence.level, isDemoMode())) {
    throw new EvidenceError("A NOC needs genuine bank confirmation. Sandbox (Mock AA) values are accepted only in demo mode.");
  }
  const code = newCode("NOC", at);
  const bankName = effectiveValue(f.bankName) as string | null;
  const payload: NocPayload = {
    code,
    caseCode: c.code,
    issuedAt: at.toISOString(),
    issuer: { name: issuer.name, designation: issuer.designation ?? "Competent Authority", office: "AICTE Regulation Bureau, New Delhi" },
    addressedTo: ins.type === "FDR" ? `The Branch Manager, ${bankName ?? "issuing bank"}` : "AICTE Finance Division",
    institution: { name: ins.institution.name, permanentId: ins.institution.permanentId, regionalOffice: ins.institution.regionalOffice },
    instrument: { code: ins.code, type: ins.type, bankName, fdrNumber: effectiveValue(f.fdrNumber) as string | null, principalPaise: principal.toString() },
    deduction: { pct, amountPaise: deduction.toString(), ruleRef: c.penaltyRuleRef },
    payableToTrustPaise: (principal - deduction).toString(),
    interest: "Accrued interest is payable to AICTE (APH 2024-27 §1.12); only principal returns to the Trust.",
    documents: ins.documents
      .filter((d) => ["FDR_COPY", "AFFIDAVIT_6", "LOA_EOA"].includes(d.kind))
      .map((d) => ({ kind: d.kind, sha256: d.sha256 })),
    bankEvidence: evidence,
  };
  const sha256 = hashJson(payload);
  const noc = await tx.noc.create({
    data: { code, caseId, instrumentId: ins.id, issuedById: issuer.id, issuedAt: at, payload: payload as unknown as Prisma.InputJsonValue, sha256 },
  });
  await anchor(tx, "NOC", noc.id, sha256);
  return noc;
}

export type NocVerification = {
  found: boolean;
  noc?: { code: string; issuedAt: Date; revokedAt: Date | null; revokeReason: string | null; issuedBy: string; payload: NocPayload; sha256: string };
  anchor?: { sha256: string; anchoredAt: Date; txRef: string | null } | null;
  recordIntact?: boolean;
  documents?: { kind: string; anchoredSha256: string; currentSha256: string | null; intact: boolean; fileId: string | null }[];
};

export async function verifyNoc(db: Db, code: string): Promise<NocVerification> {
  const noc = await db.noc.findUnique({ where: { code }, include: { issuedBy: true, instrument: { include: { documents: true } } } });
  if (!noc) return { found: false };
  const a = await db.ledgerAnchor.findFirst({ where: { refType: "NOC", refId: noc.id }, orderBy: { anchoredAt: "asc" } });
  const payload = noc.payload as unknown as NocPayload;
  const recomputed = hashJson(payload);
  const documents = [];
  for (const d of payload.documents) {
    const doc = noc.instrument.documents.find((x) => x.sha256 === d.sha256 && x.kind === d.kind) ?? noc.instrument.documents.find((x) => x.kind === d.kind);
    const file = doc ? await readFile(db, doc.fileId) : null;
    const current = file ? sha256Hex(file.bytes) : null;
    documents.push({ kind: d.kind, anchoredSha256: d.sha256, currentSha256: current, intact: current === d.sha256, fileId: doc?.fileId ?? null });
  }
  return {
    found: true,
    noc: { code: noc.code, issuedAt: noc.issuedAt, revokedAt: noc.revokedAt, revokeReason: noc.revokeReason, issuedBy: noc.issuedBy.name, payload, sha256: noc.sha256 },
    anchor: a ? { sha256: a.sha256, anchoredAt: a.anchoredAt, txRef: a.txRef } : null,
    recordIntact: !!a && recomputed === a.sha256 && recomputed === noc.sha256,
    documents,
  };
}
