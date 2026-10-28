import type { Prisma, PrismaClient } from "@prisma/client";
import { tierFieldsOf } from "../provenance";
import { asCategory, inCategory, matches, parseQuery, sortRows, toRow, type ParsedQuery, type RegistryRow, type SortKey } from "../registry";

type Db = PrismaClient | Prisma.TransactionClient;

/** Every instrument as a registry row, with the vocabulary (states, banks) the plain-words search knows. */
export async function loadRegistry(db: Db, now = new Date()) {
  const list = await db.instrument.findMany({
    include: { institution: { select: { name: true, state: true, regionalOffice: true, riskScore: true } }, _count: { select: { discrepancies: { where: { resolvedAt: null } } } } },
  });
  const rows = list.map((i) => toRow(i, tierFieldsOf(i), i._count.discrepancies, now));
  const states = [...new Set(rows.map((r) => r.state))].sort();
  const banks = [...new Set(rows.map((r) => r.bank).filter((b): b is string => !!b))].sort();
  return { rows, states, banks };
}

export type RegistryView = { rows: RegistryRow[]; all: RegistryRow[]; parsed: ParsedQuery; states: string[]; banks: string[] };

export async function queryRegistry(db: Db, p: { q?: string; cat?: string; sort?: SortKey; dir?: "asc" | "desc" }, now = new Date()): Promise<RegistryView> {
  const { rows, states, banks } = await loadRegistry(db, now);
  const parsed = parseQuery(p.q ?? "", { states, banks });
  const cat = asCategory(p.cat);
  const filtered = rows.filter((r) => inCategory(r, cat) && matches(r, parsed.query));
  return { rows: sortRows(filtered, p.sort ?? "submitted", p.dir ?? "desc"), all: rows, parsed, states, banks };
}
