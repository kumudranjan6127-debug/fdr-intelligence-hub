// DB orchestration shared by actions, cron and seed: rules lookup, discrepancy sync, risk recompute.
import type { DocumentKind, Instrument, Prisma, PrismaClient } from "@prisma/client";
import { allChains, analyzeChain, buildChain, type ChainNode } from "../chain";
import { detectDiscrepancies } from "../discrepancy";
import { duplicatePartners } from "../duplicates";
import { bestEvidence, normalize, tierFieldsOf } from "../provenance";
import { DEFAULT_RULES, parseRules, type Rules } from "../rules";
import { riskScore } from "../risk";
import { OPEN_CASE_STATUSES } from "../transitions";
import { addDays } from "../format";

type Db = PrismaClient | Prisma.TransactionClient;

/** Codes written by explicit checks (e.g. AA lookup) rather than the detector — sync never auto-resolves them. */
export const MANUAL_CODES = new Set(["BANK_RECORD_NOT_FOUND"]);

export async function getActiveRules(db: Db, at = new Date()): Promise<{ rules: Rules; version: string }> {
  const r = await db.ruleSet.findFirst({ where: { effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: "desc" } });
  return r ? { rules: parseRules(r.rules), version: r.version } : { rules: DEFAULT_RULES, version: "default" };
}

export function toChainNode(i: Pick<Instrument, "id" | "code" | "type" | "status" | "predecessorId" | "amount" | "issueDate" | "maturityDate" | "lienNoted" | "bankName" | "fdrNumber">): ChainNode {
  const f = tierFieldsOf(i);
  const amt = normalize("amount", bestEvidence(f.amount).value);
  const lien = normalize("lienNoted", bestEvidence(f.lienNoted).value);
  return {
    id: i.id,
    code: i.code,
    type: i.type,
    status: i.status,
    predecessorId: i.predecessorId,
    amountPaise: amt ? BigInt(amt) : null,
    issueDate: normalize("issueDate", bestEvidence(f.issueDate).value),
    maturityDate: normalize("maturityDate", bestEvidence(f.maturityDate).value),
    lienNoted: i.type === "FDR" && lien !== null ? lien === "true" : null,
  };
}

/** Documents whose bytes identify the deposit itself (the FDR copy or online payment receipt), not affidavits or letters. */
const EVIDENCE_DOCS: DocumentKind[] = ["FDR_COPY"];

const LIVE = { notIn: ["REJECTED", "DRAFT"] as ("REJECTED" | "DRAFT")[] };

export async function chainFor(db: Db, instrumentId: string) {
  const ins = await db.instrument.findUniqueOrThrow({ where: { id: instrumentId }, select: { institutionId: true } });
  const siblings = await db.instrument.findMany({ where: { institutionId: ins.institutionId, status: LIVE } });
  const focus = siblings.find((s) => s.id === instrumentId) ?? (await db.instrument.findUniqueOrThrow({ where: { id: instrumentId } }));
  const nodes = [...siblings.filter((s) => s.id !== focus.id), focus].map(toChainNode);
  return analyzeChain(buildChain(nodes, instrumentId));
}

/** Re-run detection for one instrument; upsert findings, resolve the ones that disappeared. Returns duplicate partners. */
export async function syncDiscrepancies(db: Db, instrumentId: string, now = new Date()): Promise<string[]> {
  const ins = await db.instrument.findUniqueOrThrow({
    where: { id: instrumentId },
    include: { documents: { select: { kind: true, sha256: true } } },
  });
  const existing = await db.discrepancy.findMany({ where: { instrumentId } });

  if (ins.status === "REJECTED") {
    await db.discrepancy.updateMany({ where: { instrumentId, resolvedAt: null }, data: { resolvedAt: now } });
    return [];
  }

  const others = await db.instrument.findMany({
    where: { id: { not: ins.id }, status: LIVE },
    select: {
      id: true,
      code: true,
      type: true,
      institutionId: true,
      bankName: true,
      fdrNumber: true,
      amount: true,
      issueDate: true,
      institution: { select: { name: true } },
      documents: { where: { kind: { in: EVIDENCE_DOCS } }, select: { sha256: true } },
    },
  });

  const detected = detectDiscrepancies({
    instrument: {
      id: ins.id,
      type: ins.type,
      institutionId: ins.institutionId,
      fields: tierFieldsOf(ins),
      requiredAmountPaise: BigInt(ins.requiredAmount.toFixed(0)),
      affidavitDueAt: ins.affidavitDueAt,
      hasAffidavit: ins.documents.some((d) => d.kind === "AFFIDAVIT_3"),
      docHashes: ins.documents.filter((d) => EVIDENCE_DOCS.includes(d.kind)).map((d) => d.sha256),
    },
    others: others.map((o) => ({ ...o, institutionName: o.institution.name, docHashes: o.documents.map((d) => d.sha256) })),
    chain: await chainFor(db, ins.id),
    now,
  });

  for (const d of detected) {
    await db.discrepancy.upsert({
      where: { instrumentId_code_field: { instrumentId, code: d.code, field: d.field } },
      create: { instrumentId, code: d.code, field: d.field, severity: d.severity, message: d.message, evidence: d.evidence as Prisma.InputJsonValue, detectedAt: now },
      update: { severity: d.severity, message: d.message, evidence: d.evidence as Prisma.InputJsonValue, resolvedAt: null },
    });
  }
  const keys = new Set(detected.map((d) => `${d.code}|${d.field}`));
  const stale = existing.filter((e) => !e.resolvedAt && !MANUAL_CODES.has(e.code) && !keys.has(`${e.code}|${e.field}`));
  if (stale.length) await db.discrepancy.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { resolvedAt: now } });

  return duplicatePartners(detected);
}

/** Sync an instrument, its duplicate partners, and the risk of every institution touched. */
export async function syncInstrument(db: Db, instrumentId: string, now = new Date()) {
  const partners = await syncDiscrepancies(db, instrumentId, now);
  for (const p of partners) await syncDiscrepancies(db, p, now);
  const ids = await db.instrument.findMany({ where: { id: { in: [instrumentId, ...partners] } }, select: { institutionId: true } });
  for (const inst of new Set(ids.map((i) => i.institutionId))) await recomputeRisk(db, inst, now);
}

export async function recomputeRisk(db: Db, institutionId: string, now = new Date()) {
  const { rules } = await getActiveRules(db, now);
  const instruments = await db.instrument.findMany({ where: { institutionId, status: LIVE } });
  const analyses = allChains(instruments.map(toChainNode)).map(analyzeChain);
  const openDiscrepancies = await db.discrepancy.count({
    where: { resolvedAt: null, severity: { in: ["MED", "HIGH"] }, instrument: { institutionId } },
  });
  const overdueCases = await db.case.count({
    where: { status: { in: OPEN_CASE_STATUSES }, statusChangedAt: { lt: addDays(now, -rules.caseSlaDays) }, instrument: { institutionId } },
  });
  const r = riskScore({
    lateRenewals: analyses.reduce((s, a) => s + a.lateRenewals, 0),
    gapDays: analyses.reduce((s, a) => s + a.totalGapDays, 0),
    openDiscrepancies,
    overdueCases,
  });
  await db.institution.update({ where: { id: institutionId }, data: { riskScore: r.score, riskBreakdown: r as unknown as Prisma.InputJsonValue } });
  return r;
}
