// Workflow commands. Each one: role check → state-machine check → transaction (state + Event) → resync.
import { randomUUID } from "crypto";
import type { Cell, DocumentKind, InstrumentStatus, InstrumentType, Prisma, Role } from "@prisma/client";
import { getAAProvider, confirmedFromFI } from "../aa";
import { db } from "../db";
import { recordEvent, type Actor } from "../events";
import { anchor } from "../hash";
import { rupeesToPaise } from "../format";
import {
  FIELD_KEYS,
  bestEvidence,
  effectiveValue,
  makeField,
  normalize,
  tierFieldsOf,
  withConfirmed,
  type FieldKey,
  type FieldValue,
  type TierFields,
} from "../provenance";
import { affidavitDeadline, penaltyAmount, releasePenalty, requiredAmount } from "../rules";
import { AuthError } from "../errors";
import {
  CASE_ACTIONS,
  TransitionError,
  assertCaseTransition,
  assertInstrumentTransition,
  canPerform,
  holdingStatus,
  type CaseAction,
} from "../transitions";
import type { ExtractionResult } from "../extract";
import { getActiveRules, syncInstrument } from "./core";
import { issueNoc, newCode } from "./noc";

type User = { id: string; role: Role; name: string; designation: string | null; institutionId: string | null; bankId: string | null; cell: Cell | null };

const actorOf = (u: User): Actor => ({ id: u.id, role: u.role });
const json = (v: unknown) => v as Prisma.InputJsonValue;

function fieldsToColumns(f: TierFields) {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, json(f[k])])) as Record<FieldKey, Prisma.InputJsonValue>;
}

function maturityOf(f: TierFields) {
  return normalize("maturityDate", bestEvidence(f.maturityDate).value);
}

async function setInstrumentStatus(tx: Prisma.TransactionClient, id: string, from: InstrumentStatus, to: InstrumentStatus, actor: Actor, caseId: string, reason?: string) {
  if (from === to) return;
  assertInstrumentTransition(from, to);
  await tx.instrument.update({ where: { id }, data: { status: to } });
  await recordEvent(tx, { instrumentId: id, caseId, actor, action: "INSTRUMENT_STATUS", before: { status: from }, after: { status: to }, reason });
}

// ───────────────────────── case actions ─────────────────────────

export async function performCaseAction(user: User, caseId: string, action: CaseAction, reason: string | null) {
  const def = CASE_ACTIONS[action];
  const now = new Date();
  const { rules } = await getActiveRules(db, now);

  const instrumentId = await db.$transaction(async (tx) => {
    const c = await tx.case.findUniqueOrThrow({ where: { id: caseId }, include: { instrument: true, clearances: true } });
    if (user.role === "INSTITUTION" && c.instrument.institutionId !== user.institutionId) throw new AuthError("Not your institution's case");
    if (user.role === "BANK" && c.instrument.bankId !== user.bankId) throw new AuthError("This instrument is not held at your bank");
    if (!canPerform(action, c, user.role)) throw new TransitionError(`${def.label} is not allowed for ${user.role} while the case is ${c.status}`);
    if (def.reasonRequired && !reason?.trim()) throw new TransitionError("A reason is mandatory for this action");
    assertCaseTransition(c.status, def.to);

    const ins = c.instrument;
    const f = tierFieldsOf(ins);
    const actor = actorOf(user);
    const data: Prisma.CaseUpdateInput = { status: def.to, statusChangedAt: now };

    switch (action) {
      case "START_SCRUTINY":
        data.assigneeRole = "RO";
        await setInstrumentStatus(tx, ins.id, ins.status, "UNDER_SCRUTINY", actor, c.id);
        break;
      case "ACCEPT": {
        Object.assign(data, { closedAt: now, assigneeRole: null, blockingReason: null, nextAction: null });
        await setInstrumentStatus(tx, ins.id, ins.status, holdingStatus(maturityOf(f), now, rules.expiringWindowDays), actor, c.id, "Verified and recorded");
        if (ins.predecessorId) {
          const pred = await tx.instrument.findUniqueOrThrow({ where: { id: ins.predecessorId } });
          const to: InstrumentStatus = c.type === "REPLACEMENT" ? "REPLACED" : "RENEWED";
          if (["ACTIVE", "EXPIRING", "MATURED"].includes(pred.status)) await setInstrumentStatus(tx, pred.id, pred.status, to, actor, c.id, `Superseded by ${ins.code}`);
        }
        break;
      }
      case "REQUEST_CLARIFICATION":
        Object.assign(data, { blockingReason: reason, assigneeRole: "INSTITUTION", nextAction: "Respond to the officer's query" });
        break;
      case "REJECT":
        Object.assign(data, { closedAt: now, blockingReason: reason, assigneeRole: null });
        if (c.type === "RELEASE") await setInstrumentStatus(tx, ins.id, ins.status, holdingStatus(maturityOf(f), now, rules.expiringWindowDays), actor, c.id, "Release rejected");
        else await setInstrumentStatus(tx, ins.id, ins.status, "REJECTED", actor, c.id, reason ?? undefined);
        break;
      case "RESPOND":
        Object.assign(data, { blockingReason: null, assigneeRole: "BUREAU", nextAction: null });
        if (ins.status === "UNDER_SCRUTINY") await setInstrumentStatus(tx, ins.id, ins.status, "SUBMITTED", actor, c.id);
        break;
      case "SEND_FOR_CLEARANCES":
        data.assigneeRole = "CELL";
        for (const cell of ["FINANCE", "LEGAL", "GRIEVANCE"] as Cell[]) {
          if (!c.clearances.some((x) => x.cell === cell)) await tx.clearance.create({ data: { caseId: c.id, cell } });
        }
        break;
      case "APPROVE_RELEASE":
        Object.assign(data, { decisionNote: reason?.trim() || `Release approved with ${c.penaltyPct ?? 0}% deduction`, assigneeRole: "AUTHORITY" });
        break;
      case "ISSUE_NOC": {
        const noc = await issueNoc(tx, c.id, user, now);
        data.assigneeRole = ins.type === "FDR" ? "BANK" : "BUREAU";
        await recordEvent(tx, { instrumentId: ins.id, caseId: c.id, actor, action: "NOC_ISSUED", after: { noc: noc.code, sha256: noc.sha256 } });
        break;
      }
      case "BANK_CONFIRM":
        break;
    }

    await tx.case.update({ where: { id: c.id }, data });
    await recordEvent(tx, { instrumentId: ins.id, caseId: c.id, actor, action: `CASE_${action}`, before: { status: c.status }, after: { status: def.to }, reason });

    if (action === "BANK_CONFIRM") {
      // Lien lifted / refund remitted → instrument released, case closed.
      await setInstrumentStatus(tx, ins.id, ins.status, "RELEASED", actor, c.id, "Lien lifted; principal paid to Trust");
      if (ins.bankId) {
        const no = normalize("fdrNumber", effectiveValue(f.fdrNumber));
        const recs = await tx.bankDepositRecord.findMany({ where: { bankId: ins.bankId } });
        const rec = recs.find((r) => normalize("fdrNumber", r.fdrNumber) === no);
        if (rec) await tx.bankDepositRecord.update({ where: { id: rec.id }, data: { status: "LIEN_RELEASED", lienMarked: false } });
      }
      assertCaseTransition("BANK_CONFIRMED", "CLOSED");
      await tx.case.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: now, statusChangedAt: now, assigneeRole: null } });
      await recordEvent(tx, { instrumentId: ins.id, caseId: c.id, actor, action: "CASE_CLOSED", before: { status: "BANK_CONFIRMED" }, after: { status: "CLOSED" } });
    }
    return ins.id;
  });

  await syncInstrument(db, instrumentId, now);
}

// ───────────────────────── clearances ─────────────────────────

export async function decideClearance(user: User, caseId: string, cell: Cell, decision: "CLEARED" | "OBJECTION", note: string | null) {
  if (user.role !== "ADMIN" && !(user.role === "CELL" && user.cell === cell)) throw new AuthError(`Only the ${cell} cell can decide this clearance`);
  if (decision === "OBJECTION" && !note?.trim()) throw new TransitionError("An objection needs a note");
  const now = new Date();
  const { rules } = await getActiveRules(db, now);

  const instrumentId = await db.$transaction(async (tx) => {
    const c = await tx.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { clearances: true, instrument: { include: { institution: true, documents: true, discrepancies: { where: { resolvedAt: null } } } } },
    });
    if (c.status !== "CLEARANCES_PENDING") throw new TransitionError("Case is not awaiting clearances");
    const cl = c.clearances.find((x) => x.cell === cell);
    if (!cl) throw new TransitionError("No clearance requested from this cell");
    await tx.clearance.update({ where: { id: cl.id }, data: { status: decision, note, decidedById: user.id, decidedAt: now } });
    await recordEvent(tx, { instrumentId: c.instrumentId, caseId, actor: actorOf(user), action: `CLEARANCE_${decision}`, before: { cell, status: cl.status }, after: { cell, status: decision }, reason: note });

    const statuses = c.clearances.map((x) => (x.id === cl.id ? decision : x.status));
    if (statuses.every((s) => s === "CLEARED")) {
      const ins = c.instrument;
      const p = releasePenalty(
        { lastEoaYear: ins.institution.lastEoaYear, asOf: now, closureDocsLapsed: ins.institution.closureDocsLapsed, encashedBeforeMaturity: false },
        rules,
      );
      const principal = BigInt(String(effectiveValue(tierFieldsOf(ins).amount) ?? "0"));
      assertCaseTransition("CLEARANCES_PENDING", "PENALTY_ASSESSMENT");
      await tx.case.update({
        where: { id: caseId },
        data: {
          status: "PENALTY_ASSESSMENT",
          statusChangedAt: now,
          penaltyPct: p.pct,
          penaltyRuleRef: p.ruleRef,
          penaltyAmount: penaltyAmount(principal, p.pct).toString(),
          assigneeRole: "AUTHORITY",
        },
      });
      await recordEvent(tx, {
        instrumentId: ins.id,
        caseId,
        actor: { id: null, role: "ADMIN" },
        action: "PENALTY_ASSESSED",
        before: { status: "CLEARANCES_PENDING" },
        after: { status: "PENALTY_ASSESSMENT", pct: p.pct, ruleRef: p.ruleRef, reasons: p.reasons },
        reason: "All cell clearances recorded — penalty engine applied",
      });
    }
    return c.instrumentId;
  });
  await syncInstrument(db, instrumentId, now);
}

// ───────────────────────── submissions ─────────────────────────

export type SubmissionInput = {
  type: InstrumentType;
  caseType: "NEW_SUBMISSION" | "RENEWAL" | "REPLACEMENT";
  predecessorId: string | null;
  claimed: { bankName: string; fdrNumber: string; amountRupees: number; issueDate: string; maturityDate: string; lienNoted: boolean | null };
  upload: { fileId: string; extraction: ExtractionResult } | null;
  affidavitFileId: string | null;
};

export async function createSubmission(user: User, input: SubmissionInput) {
  if (user.role !== "INSTITUTION" || !user.institutionId) throw new AuthError("Only institution users can submit instruments");
  const now = new Date();
  const { rules } = await getActiveRules(db, now);

  const result = await db.$transaction(async (tx) => {
    const institution = await tx.institution.findUniqueOrThrow({ where: { id: user.institutionId! } });
    if (input.predecessorId) {
      const pred = await tx.instrument.findUniqueOrThrow({ where: { id: input.predecessorId } });
      if (pred.institutionId !== institution.id) throw new AuthError("Predecessor belongs to another institution");
      if (!["ACTIVE", "EXPIRING", "MATURED"].includes(pred.status)) throw new TransitionError(`Cannot renew an instrument that is ${pred.status}`);
    } else if (input.caseType !== "NEW_SUBMISSION") {
      throw new TransitionError("A renewal or replacement must name the instrument it supersedes");
    }

    const banks = await tx.bank.findMany();
    const bank = banks.find((b) => normalize("bankName", b.name) === normalize("bankName", input.claimed.bankName)) ?? null;

    const fdrDocId = input.upload ? randomUUID() : null;
    const claimed: Record<FieldKey, FieldValue> = {
      bankName: input.claimed.bankName,
      fdrNumber: input.claimed.fdrNumber,
      amount: rupeesToPaise(input.claimed.amountRupees),
      issueDate: input.claimed.issueDate,
      maturityDate: input.claimed.maturityDate,
      lienNoted: input.type === "FDR" ? input.claimed.lienNoted : null,
    };
    const fields = Object.fromEntries(
      FIELD_KEYS.map((k) => {
        const ex = input.upload?.extraction.fields[k];
        const extracted = ex && ex.value !== null ? { value: ex.value, confidence: ex.confidence, documentId: fdrDocId, bbox: null, engine: input.upload!.extraction.engine } : null;
        return [k, makeField(k, claimed[k], extracted)];
      }),
    ) as TierFields;

    const ins = await tx.instrument.create({
      data: {
        code: newCode("INS", now),
        institutionId: institution.id,
        type: input.type,
        status: "SUBMITTED",
        bankId: bank?.id ?? null,
        ...fieldsToColumns(fields),
        requiredAmount: requiredAmount(institution, rules).toString(),
        intimationDate: now,
        affidavitDueAt: affidavitDeadline(now, rules),
        submittedAt: now,
        predecessorId: input.predecessorId,
      },
    });
    const actor = actorOf(user);
    await recordEvent(tx, { instrumentId: ins.id, actor, action: "INSTRUMENT_SUBMITTED", after: { code: ins.code, type: ins.type, claimed }, reason: input.caseType });

    const attach = async (fileId: string, kind: DocumentKind, id?: string, extractedJson?: unknown) => {
      const file = await tx.storedFile.findUniqueOrThrow({ where: { id: fileId } });
      const doc = await tx.document.create({
        data: {
          id,
          instrumentId: ins.id,
          kind,
          fileId,
          url: `/api/files/${fileId}`,
          filename: file.filename,
          sha256: file.sha256,
          uploadedById: user.id,
          extractedJson: extractedJson ? json(extractedJson) : undefined,
        },
      });
      await anchor(tx, "DOCUMENT", doc.id, doc.sha256);
      await recordEvent(tx, { instrumentId: ins.id, actor, action: "DOCUMENT_UPLOADED", after: { kind, filename: doc.filename, sha256: doc.sha256 } });
      return doc;
    };
    if (input.upload) {
      await attach(input.upload.fileId, "FDR_COPY", fdrDocId!, input.upload.extraction);
      await recordEvent(tx, {
        instrumentId: ins.id,
        actor: { id: null, role: "ADMIN" },
        action: "AI_EXTRACTED",
        after: { engine: input.upload.extraction.engine, fields: input.upload.extraction.fields, notes: input.upload.extraction.notes },
        reason: "Extraction stored in the 'extracted' tier; not auto-accepted",
      });
    }
    if (input.affidavitFileId) await attach(input.affidavitFileId, "AFFIDAVIT_3");

    const kase = await tx.case.create({
      data: { code: newCode("CASE", now), instrumentId: ins.id, type: input.caseType, status: "SUBMITTED", assigneeRole: "BUREAU", openedAt: now, statusChangedAt: now },
    });
    await recordEvent(tx, { instrumentId: ins.id, caseId: kase.id, actor, action: "CASE_OPENED", after: { code: kase.code, type: kase.type, status: kase.status } });
    return { instrumentId: ins.id, caseId: kase.id };
  });

  await syncInstrument(db, result.instrumentId, now);
  return result;
}

// ───────────────────────── release ─────────────────────────

export async function applyForRelease(user: User, instrumentId: string, files: { kind: DocumentKind; fileId: string }[], note: string | null) {
  if (user.role !== "INSTITUTION") throw new AuthError("Only the institution can apply for release (APH §6.46)");
  const now = new Date();
  const res = await db.$transaction(async (tx) => {
    const ins = await tx.instrument.findUniqueOrThrow({ where: { id: instrumentId }, include: { cases: true } });
    if (ins.institutionId !== user.institutionId) throw new AuthError("Not your instrument");
    if (ins.cases.some((c) => c.type === "RELEASE" && !["CLOSED", "REJECTED", "WITHDRAWN"].includes(c.status))) throw new TransitionError("A release application is already open");
    const actor = actorOf(user);
    const kase = await tx.case.create({
      data: { code: newCode("CASE", now), instrumentId: ins.id, type: "RELEASE", status: "SUBMITTED", assigneeRole: "BUREAU", openedAt: now, statusChangedAt: now },
    });
    await setInstrumentStatus(tx, ins.id, ins.status, "RELEASE_REQUESTED", actor, kase.id, note ?? undefined);
    for (const f of files) {
      const file = await tx.storedFile.findUniqueOrThrow({ where: { id: f.fileId } });
      const doc = await tx.document.create({
        data: { instrumentId: ins.id, caseId: kase.id, kind: f.kind, fileId: f.fileId, url: `/api/files/${f.fileId}`, filename: file.filename, sha256: file.sha256, uploadedById: user.id },
      });
      await anchor(tx, "DOCUMENT", doc.id, doc.sha256);
      await recordEvent(tx, { instrumentId: ins.id, caseId: kase.id, actor, action: "DOCUMENT_UPLOADED", after: { kind: f.kind, filename: doc.filename, sha256: doc.sha256 } });
    }
    await recordEvent(tx, { instrumentId: ins.id, caseId: kase.id, actor, action: "CASE_OPENED", after: { code: kase.code, type: "RELEASE", status: "SUBMITTED" }, reason: note });
    return kase.id;
  });
  await syncInstrument(db, instrumentId, now);
  return res;
}

// ───────────────────────── bank confirmation (AA) ─────────────────────────

export async function fetchBankConfirmation(user: User, instrumentId: string) {
  if (!["RO", "BUREAU", "ADMIN", "BANK"].includes(user.role)) throw new AuthError("Not allowed to request bank confirmation");
  const now = new Date();
  const ins = await db.instrument.findUniqueOrThrow({ where: { id: instrumentId } });
  if (user.role === "BANK" && ins.bankId !== user.bankId) throw new AuthError("Not held at your bank");
  const f = tierFieldsOf(ins);
  const aa = getAAProvider();
  const fdrNumber = String(f.fdrNumber.claimed ?? "");
  const actor = actorOf(user);

  if (!ins.bankId) {
    await db.$transaction(async (tx) => {
      await tx.discrepancy.upsert({
        where: { instrumentId_code_field: { instrumentId, code: "BANK_RECORD_NOT_FOUND", field: "bankName" } },
        create: { instrumentId, code: "BANK_RECORD_NOT_FOUND", field: "bankName", severity: "HIGH", message: `Bank “${String(f.bankName.claimed)}” is not a registered FIP`, evidence: {} },
        update: { resolvedAt: null },
      });
      await recordEvent(tx, { instrumentId, actor, action: "AA_FIP_UNKNOWN", reason: String(f.bankName.claimed) });
    });
    return { found: false as const, provider: aa.name };
  }

  const consent = await aa.requestConsent({ fipId: ins.bankId, fdrNumber, purpose: "Verification of security deposit held in favour of AICTE" });
  const fi = await aa.fetchTermDeposit(consent, { fipId: ins.bankId, fdrNumber });

  await db.$transaction(async (tx) => {
    if (!fi) {
      await tx.discrepancy.upsert({
        where: { instrumentId_code_field: { instrumentId, code: "BANK_RECORD_NOT_FOUND", field: "fdrNumber" } },
        create: { instrumentId, code: "BANK_RECORD_NOT_FOUND", field: "fdrNumber", severity: "HIGH", message: `Bank has no term deposit numbered ${fdrNumber}`, evidence: { consentId: consent.consentId } },
        update: { resolvedAt: null, evidence: { consentId: consent.consentId } },
      });
      await recordEvent(tx, { instrumentId, actor, action: "AA_NOT_FOUND", after: { consentId: consent.consentId, provider: aa.name } });
      return;
    }
    const confirmed = confirmedFromFI(fi, consent.consentId, aa.isMock);
    const next = { ...f };
    for (const k of FIELD_KEYS) {
      if (ins.type === "ONLINE_DEPOSIT" && k === "lienNoted") continue;
      if (confirmed[k]) next[k] = withConfirmed(k, f[k], confirmed[k]!);
    }
    await tx.instrument.update({ where: { id: instrumentId }, data: fieldsToColumns(next) });
    await tx.discrepancy.updateMany({ where: { instrumentId, code: "BANK_RECORD_NOT_FOUND", resolvedAt: null }, data: { resolvedAt: now } });
    await recordEvent(tx, {
      instrumentId,
      actor,
      action: "AA_CONFIRMED",
      before: Object.fromEntries(FIELD_KEYS.map((k) => [k, f[k].status])),
      after: { consentId: consent.consentId, provider: aa.name, fi, statuses: Object.fromEntries(FIELD_KEYS.map((k) => [k, next[k].status])) },
    });
  });
  await syncInstrument(db, instrumentId, now);
  return { found: !!fi, provider: aa.name };
}

// ───────────────────────── NOC revocation ─────────────────────────

export async function revokeNoc(user: User, code: string, reason: string) {
  if (!["AUTHORITY", "ADMIN"].includes(user.role)) throw new AuthError("Only the competent authority can revoke a NOC");
  if (!reason.trim()) throw new TransitionError("A revocation reason is mandatory");
  await db.$transaction(async (tx) => {
    const noc = await tx.noc.findUniqueOrThrow({ where: { code } });
    if (noc.revokedAt) throw new TransitionError("NOC already revoked");
    await tx.noc.update({ where: { id: noc.id }, data: { revokedAt: new Date(), revokeReason: reason } });
    await recordEvent(tx, { instrumentId: noc.instrumentId, caseId: noc.caseId, actor: actorOf(user), action: "NOC_REVOKED", after: { noc: code }, reason });
  });
}

export const RELEASE_ELIGIBLE: InstrumentStatus[] = ["ACTIVE", "EXPIRING", "MATURED"];

// ───────────────────────── supplementary documents ─────────────────────────

/** Institution adds a document (e.g. a missing affidavit or a corrected FDR copy). FDR copies are re-extracted. */
export async function addInstrumentDocument(user: User, instrumentId: string, kind: DocumentKind, fileId: string, extraction: ExtractionResult | null) {
  if (user.role !== "INSTITUTION") throw new AuthError("Only the institution can add documents here");
  const now = new Date();
  await db.$transaction(async (tx) => {
    const ins = await tx.instrument.findUniqueOrThrow({ where: { id: instrumentId }, include: { documents: { select: { kind: true } } } });
    if (ins.institutionId !== user.institutionId) throw new AuthError("Not your instrument");
    const file = await tx.storedFile.findUniqueOrThrow({ where: { id: fileId } });
    const version = ins.documents.filter((d) => d.kind === kind).length + 1;
    const doc = await tx.document.create({
      data: { instrumentId, kind, fileId, url: `/api/files/${fileId}`, filename: file.filename, sha256: file.sha256, version, uploadedById: user.id, extractedJson: extraction ? json(extraction) : undefined },
    });
    await anchor(tx, "DOCUMENT", doc.id, doc.sha256);
    const actor = actorOf(user);
    await recordEvent(tx, { instrumentId, actor, action: "DOCUMENT_UPLOADED", after: { kind, filename: doc.filename, sha256: doc.sha256, version } });
    if (kind === "FDR_COPY" && extraction) {
      const f = tierFieldsOf(ins);
      const next = Object.fromEntries(
        FIELD_KEYS.map((k) => {
          const ex = extraction.fields[k];
          const extracted = ex && ex.value !== null ? { value: ex.value, confidence: ex.confidence, documentId: doc.id, bbox: null, engine: extraction.engine } : f[k].extracted;
          return [k, makeField(k, f[k].claimed, ins.type === "ONLINE_DEPOSIT" && k === "lienNoted" ? null : extracted, f[k].confirmed)];
        }),
      ) as TierFields;
      await tx.instrument.update({ where: { id: instrumentId }, data: fieldsToColumns(next) });
      await recordEvent(tx, { instrumentId, actor: { id: null, role: "ADMIN" }, action: "AI_EXTRACTED", after: { engine: extraction.engine, fields: extraction.fields, documentVersion: version } });
    }
  });
  await syncInstrument(db, instrumentId, now);
}
