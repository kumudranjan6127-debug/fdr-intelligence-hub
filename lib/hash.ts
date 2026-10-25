// SHA-256 of files and canonical JSON. A matching hash proves a record is *unchanged* since it was
// anchored — not that a bank issued it. Authenticity comes from the bank (AA / bank portal).
import { createHash } from "crypto";
import type { AnchorRefType, Prisma, PrismaClient } from "@prisma/client";

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** Deterministic JSON: sorted keys; Dates → ISO; Decimal/bigint → string. */
export function canonicalJson(v: unknown): string {
  const plain = JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
  return JSON.stringify(sortKeys(plain));
}

export function hashJson(v: unknown): string {
  return sha256Hex(canonicalJson(v));
}

export type EventHashInput = {
  prevSha256: string | null;
  instrumentId: string | null;
  caseId: string | null;
  actorId: string | null;
  actorRole: string;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date | string;
};

export function hashEvent(e: EventHashInput): string {
  return hashJson({ ...e, createdAt: new Date(e.createdAt).toISOString() });
}

type Db = PrismaClient | Prisma.TransactionClient;

/** MVP ledger: the hash is stored in LedgerAnchor ("Hash anchored (DB) — ledger in Phase 3"). */
export async function anchor(db: Db, refType: AnchorRefType, refId: string, sha256: string) {
  return db.ledgerAnchor.create({ data: { refType, refId, sha256 } });
}
