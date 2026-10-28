// Read models shared by the passport, officer case page and queue.
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { tierFieldsOf } from "./provenance";
import { whyPending, type WhyPending } from "./whyPending";
import { chainFor, getActiveRules } from "./services/core";
import { releasePenalty, penaltyAmount } from "./rules";
import { effectiveValue } from "./provenance";
import type { SessionUser } from "./session";
import { OPEN_CASE_STATUSES } from "./transitions";

export const caseInclude = {
  clearances: true,
  documents: { select: { kind: true } },
  instrument: {
    include: {
      institution: true,
      documents: { select: { kind: true, createdAt: true } },
      discrepancies: { where: { resolvedAt: null }, select: { severity: true, message: true } },
    },
  },
} satisfies Prisma.CaseInclude;

export type CaseForWhy = Prisma.CaseGetPayload<{ include: typeof caseInclude }>;

export async function userNames(ids: (string | null | undefined)[]) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export function whyFor(c: CaseForWhy, slaDays: number, names: Map<string, string>, now = new Date()): WhyPending {
  return whyPending({
    case: {
      type: c.type,
      status: c.status,
      statusChangedAt: c.statusChangedAt,
      blockingReason: c.blockingReason,
      penaltyPct: c.penaltyPct === null ? null : Number(c.penaltyPct),
      penaltyRuleRef: c.penaltyRuleRef,
    },
    instrumentType: c.instrument.type,
    clearances: c.clearances.map((x) => ({ cell: x.cell, status: x.status, decidedAt: x.decidedAt, decidedBy: x.decidedById ? names.get(x.decidedById) ?? null : null, note: x.note })),
    documentKinds: c.instrument.documents.map((d) => d.kind),
    openDiscrepancies: c.instrument.discrepancies,
    now,
    slaDays,
  });
}

/** Can this user see this instrument? Institutions see their own; banks see deposits held with them. */
export function canView(user: SessionUser, ins: { institutionId: string; bankId: string | null }) {
  if (user.role === "INSTITUTION") return ins.institutionId === user.institutionId;
  if (user.role === "BANK") return ins.bankId === user.bankId;
  return true;
}

export async function loadInstrument(id: string, now = new Date()) {
  const ins = await db.instrument.findUnique({
    where: { id },
    include: {
      institution: true,
      bank: true,
      documents: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      discrepancies: { orderBy: [{ resolvedAt: "asc" }, { severity: "desc" }] },
      reminders: { orderBy: { createdAt: "desc" } },
      nocs: { orderBy: { issuedAt: "desc" } },
      successors: { select: { id: true, code: true, status: true } },
      events: { include: { actor: { select: { name: true } } }, orderBy: { seq: "desc" }, take: 60 },
      cases: { include: caseInclude, orderBy: { openedAt: "desc" } },
    },
  });
  if (!ins) return null;
  const { rules, version } = await getActiveRules(db);
  const anchors = await db.ledgerAnchor.findMany({ where: { refType: "DOCUMENT", refId: { in: ins.documents.map((d) => d.id) } } });
  const anchored = new Map(anchors.map((a) => [a.refId, a]));
  const names = await userNames(ins.cases.flatMap((c) => c.clearances.map((x) => x.decidedById)));
  const openCases = ins.cases.filter((c) => OPEN_CASE_STATUSES.includes(c.status));
  return {
    ins,
    fields: tierFieldsOf(ins),
    chain: await chainFor(db, ins.id),
    rules,
    rulesVersion: version,
    anchored,
    openCases,
    why: openCases.map((c) => ({ case: c, why: whyFor(c, rules.caseSlaDays, names, now) })),
    names,
  };
}

/** Penalty preview for a release case, with the rule reference (U5). */
export function penaltyPreview(c: CaseForWhy, rules: Awaited<ReturnType<typeof getActiveRules>>["rules"], now = new Date()) {
  const ins = c.instrument;
  const p = releasePenalty({ lastEoaYear: ins.institution.lastEoaYear, asOf: now, closureDocsLapsed: ins.institution.closureDocsLapsed, encashedBeforeMaturity: false }, rules);
  const principal = BigInt(String(effectiveValue(tierFieldsOf(ins).amount) ?? "0"));
  const deduction = penaltyAmount(principal, p.pct);
  return { ...p, principal, deduction, payable: principal - deduction };
}
