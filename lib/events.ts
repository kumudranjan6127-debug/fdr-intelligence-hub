// Append-only audit trail. Every state change writes an Event whose hash covers the previous event's
// hash, and anchors it. Nothing is deleted — only statuses change.
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { anchor, hashEvent } from "./hash";

type Db = PrismaClient | Prisma.TransactionClient;

export type Actor = { id: string; role: Role } | { id: null; role: "ADMIN" }; // id null = system job

export const SYSTEM: Actor = { id: null, role: "ADMIN" };

export type EventInput = {
  instrumentId?: string | null;
  caseId?: string | null;
  actor: Actor;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  at?: Date;
};

function toJson(v: unknown) {
  return v === undefined || v === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as Prisma.InputJsonValue);
}

export async function recordEvent(tx: Db, e: EventInput) {
  const prev = await tx.event.findFirst({ orderBy: { seq: "desc" }, select: { sha256: true } });
  const createdAt = e.at ?? new Date();
  const before = e.before === undefined ? null : JSON.parse(JSON.stringify(e.before, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
  const after = e.after === undefined ? null : JSON.parse(JSON.stringify(e.after, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
  const input = {
    prevSha256: prev?.sha256 ?? null,
    instrumentId: e.instrumentId ?? null,
    caseId: e.caseId ?? null,
    actorId: e.actor.id,
    actorRole: e.actor.role,
    action: e.action,
    before,
    after,
    reason: e.reason ?? null,
    createdAt,
  };
  const sha256 = hashEvent(input);
  const ev = await tx.event.create({
    data: {
      instrumentId: input.instrumentId,
      caseId: input.caseId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      before: toJson(before),
      after: toJson(after),
      reason: input.reason,
      prevSha256: input.prevSha256,
      sha256,
      createdAt,
    },
  });
  await anchor(tx, "EVENT", ev.id, sha256);
  return ev;
}

export type ChainVerification = { ok: boolean; checked: number; brokenAt: number | null; problem: string | null };

/** Recompute every event hash in sequence and check each link to its predecessor. */
export async function verifyEventChain(db: Db): Promise<ChainVerification> {
  const events = await db.event.findMany({ orderBy: { seq: "asc" } });
  let prev: string | null = null;
  for (const e of events) {
    if (e.prevSha256 !== prev) return { ok: false, checked: events.length, brokenAt: e.seq, problem: "Link to previous event does not match" };
    const recomputed = hashEvent({
      prevSha256: e.prevSha256,
      instrumentId: e.instrumentId,
      caseId: e.caseId,
      actorId: e.actorId,
      actorRole: e.actorRole,
      action: e.action,
      before: e.before ?? null,
      after: e.after ?? null,
      reason: e.reason,
      createdAt: e.createdAt,
    });
    if (recomputed !== e.sha256) return { ok: false, checked: events.length, brokenAt: e.seq, problem: "Event content changed after it was recorded" };
    prev = e.sha256;
  }
  return { ok: true, checked: events.length, brokenAt: null, problem: null };
}
