// Validity & maturity tracking. Recomputes EXPIRING / MATURED and creates in-app reminders.
// Idempotent: reminders are unique per (instrument, kind), status changes only happen when needed.
import type { PrismaClient, ReminderKind } from "@prisma/client";
import { SYSTEM, recordEvent } from "../events";
import { addDays, daysBetween, fmtDate, parseDay } from "../format";
import { bestEvidence, normalize, tierFieldsOf } from "../provenance";
import { holdingStatus } from "../transitions";
import { getActiveRules, recomputeRisk, syncDiscrepancies } from "./core";

export type MaturityJobResult = {
  ranAt: string;
  checked: number;
  statusChanges: { code: string; from: string; to: string }[];
  remindersCreated: { code: string; kind: ReminderKind; message: string }[];
};

export async function runMaturityJob(db: PrismaClient, now = new Date()): Promise<MaturityJobResult> {
  const { rules } = await getActiveRules(db, now);
  const result: MaturityJobResult = { ranAt: now.toISOString(), checked: 0, statusChanges: [], remindersCreated: [] };

  const holding = await db.instrument.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRING", "MATURED"] } },
    include: {
      successors: { select: { id: true, status: true } },
      cases: { select: { type: true, status: true } },
      reminders: { select: { kind: true } },
      institution: { select: { name: true } },
    },
  });

  const remind = async (instrumentId: string, code: string, have: ReminderKind[], kind: ReminderKind, dueAt: Date, message: string) => {
    if (have.includes(kind)) return;
    await db.reminder.create({ data: { instrumentId, kind, dueAt, message, sentAt: now, channel: "INAPP" } });
    await recordEvent(db, { instrumentId, actor: SYSTEM, action: "REMINDER_SENT", after: { kind, channel: "INAPP", message }, at: now });
    result.remindersCreated.push({ code, kind, message });
  };

  for (const ins of holding) {
    result.checked++;
    const mat = normalize("maturityDate", bestEvidence(tierFieldsOf(ins).maturityDate).value);
    const next = holdingStatus(mat, now, rules.expiringWindowDays);
    if (next !== ins.status) {
      await db.instrument.update({ where: { id: ins.id }, data: { status: next } });
      await recordEvent(db, { instrumentId: ins.id, actor: SYSTEM, action: "STATUS_RECOMPUTED", before: { status: ins.status }, after: { status: next }, reason: `Maturity ${fmtDate(mat)}`, at: now });
      result.statusChanges.push({ code: ins.code, from: ins.status, to: next });
    }
    if (!mat) continue;

    const covered = ins.successors.some((s) => !["REJECTED", "DRAFT"].includes(s.status)) || ins.cases.some((c) => c.type === "RELEASE" && !["REJECTED", "WITHDRAWN"].includes(c.status));
    if (covered) continue;

    const days = daysBetween(now, mat);
    const have = ins.reminders.map((r) => r.kind);
    if (days <= 0) {
      await remind(ins.id, ins.code, have, "OVERDUE", parseDay(mat), `${ins.code} matured on ${fmtDate(mat)} with no renewal or release application. Renew, replace, or apply for release.`);
      continue;
    }
    // Only the tightest threshold that applies.
    const threshold = [...rules.maturityReminderDays].sort((a, b) => a - b).find((d) => days <= d);
    if (threshold) {
      const kind = `MATURITY_${threshold}` as ReminderKind;
      await remind(ins.id, ins.code, have, kind, addDays(parseDay(mat), -threshold), `${ins.code} matures in ${days} days (${fmtDate(mat)}). Arrange renewal with fresh lien in favour of AICTE.`);
    }
  }

  const affidavitDue = await db.instrument.findMany({
    where: {
      affidavitDueAt: { lte: addDays(now, 7) },
      status: { notIn: ["REJECTED", "DRAFT", "RELEASED", "CLOSED"] },
      documents: { none: { kind: "AFFIDAVIT_3" } },
      reminders: { none: { kind: "AFFIDAVIT_DUE" } },
    },
  });
  for (const ins of affidavitDue) {
    await remind(ins.id, ins.code, [], "AFFIDAVIT_DUE", ins.affidavitDueAt!, `Affidavit for ${ins.code} is due by ${fmtDate(ins.affidavitDueAt)}. Late submission attracts 10% / 20% penalty (APH cl. 2.25(f)).`);
  }

  const all = await db.instrument.findMany({ select: { id: true, institutionId: true } });
  for (const i of all) await syncDiscrepancies(db, i.id, now);
  for (const inst of new Set(all.map((i) => i.institutionId))) await recomputeRisk(db, inst, now);
  return result;
}
