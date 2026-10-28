// In-app notifications: maturity reminders plus what other people did on the user's instruments.
// There is no read/unread state yet; the bell counts what arrived in the last 7 days.
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { humanize } from "../format";
import type { SessionUser } from "../session";

export type Notice = {
  id: string;
  kind: "reminder" | "event";
  tone: "info" | "warn" | "danger" | "ok";
  title: string;
  detail: string;
  at: Date;
  href: string | null;
};

const EVENT_TITLE: Record<string, string> = {
  INSTRUMENT_SUBMITTED: "Instrument submitted",
  CASE_REQUEST_CLARIFICATION: "Clarification requested",
  CASE_ACCEPT: "Instrument accepted",
  CASE_REJECT: "Instrument rejected",
  AA_CONFIRMED: "Bank confirmation received",
  AA_NOT_FOUND: "Bank could not find the deposit",
  PENALTY_ASSESSED: "Penalty assessed",
  CLEARANCE_CLEARED: "Clearance given",
  NOC_ISSUED: "NOC issued",
  NOC_REVOKED: "NOC revoked",
  CASE_BANK_CONFIRM: "Bank confirmed the lien is lifted",
  CASE_CLOSED: "Case closed",
};

const DANGER = new Set(["NOC_REVOKED", "AA_NOT_FOUND", "CASE_REJECT"]);
const WARN = new Set(["CASE_REQUEST_CLARIFICATION", "PENALTY_ASSESSED"]);
const OK = new Set(["CASE_ACCEPT", "AA_CONFIRMED", "NOC_ISSUED", "CASE_BANK_CONFIRM", "CLEARANCE_CLEARED"]);

function scope(user: SessionUser): Prisma.InstrumentWhereInput {
  if (user.role === "INSTITUTION") return { institutionId: user.institutionId ?? "-" };
  if (user.role === "BANK") return { bankId: user.bankId ?? "-" };
  return {};
}

const passportHref = (instrumentId: string) => `/institution/instruments/${instrumentId}`;

export async function notificationsFor(user: SessionUser, limit = 40): Promise<Notice[]> {
  const where = scope(user);
  const [reminders, events] = await Promise.all([
    db.reminder.findMany({ where: { instrument: where }, include: { instrument: { select: { id: true, code: true } } }, orderBy: { createdAt: "desc" }, take: limit }),
    db.event.findMany({
      where: { action: { in: Object.keys(EVENT_TITLE) }, instrument: where, NOT: { actorId: user.id } },
      include: { instrument: { select: { id: true, code: true, institution: { select: { name: true } } } }, actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  const out: Notice[] = [
    ...reminders.map(
      (r): Notice => ({
        id: `r-${r.id}`,
        kind: "reminder",
        tone: r.kind === "OVERDUE" ? "danger" : r.kind === "MATURITY_7" ? "warn" : "info",
        title: r.message,
        detail: `${humanize(r.kind)} reminder · ${r.instrument.code} · ${humanize(r.channel)}`,
        at: r.sentAt ?? r.createdAt,
        href: passportHref(r.instrument.id),
      }),
    ),
    ...events.map(
      (e): Notice => ({
        id: `e-${e.id}`,
        kind: "event",
        tone: DANGER.has(e.action) ? "danger" : WARN.has(e.action) ? "warn" : OK.has(e.action) ? "ok" : "info",
        title: `${EVENT_TITLE[e.action] ?? humanize(e.action)}${e.instrument ? ` · ${e.instrument.code}` : ""}`,
        detail: [e.instrument?.institution.name.split(",")[0], e.actor?.name ?? humanize(e.actorRole), e.reason].filter(Boolean).join(" · "),
        at: e.createdAt,
        href: e.instrument ? passportHref(e.instrument.id) : null,
      }),
    ),
  ];
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function recentNoticeCount(user: SessionUser, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const where = scope(user);
  const [r, e] = await Promise.all([
    db.reminder.count({ where: { instrument: where, createdAt: { gte: since } } }),
    db.event.count({ where: { action: { in: Object.keys(EVENT_TITLE) }, instrument: where, NOT: { actorId: user.id }, createdAt: { gte: since } } }),
  ]);
  return r + e;
}
