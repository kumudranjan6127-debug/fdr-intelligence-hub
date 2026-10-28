// FDR registry: one row per instrument, category tiles, and a plain-words search read by rules on the
// portal itself (no outside AI service). "expiring in 60 days in Maharashtra above 50 lakh not bank verified".
import type { InstrumentStatus } from "@prisma/client";
import { evidenceKeys, evidenceLevel } from "./evidence";
import { daysBetween } from "./format";
import { FIELD_KEYS, effectiveValue, type TierFields } from "./provenance";

export type Trust = "MISMATCH" | "CONFIRMED" | "SANDBOX" | "EXTRACTED" | "CLAIMED";

export type RegistryRow = {
  id: string;
  code: string;
  type: string;
  status: InstrumentStatus;
  institutionId: string;
  institution: string;
  state: string;
  regionalOffice: string;
  risk: number;
  /** The institution's required deposit as recorded on this instrument (APH Table 1.4). */
  requiredPaise: bigint;
  bank: string | null;
  fdrNumber: string | null;
  amountPaise: bigint;
  issueDate: string | null;
  maturityDate: string | null;
  /** Negative once matured. Null when no maturity date is on record. */
  daysToMaturity: number | null;
  trust: Trust;
  lien: boolean | null;
  lienConfirmed: boolean;
  openDiscrepancies: number;
  submittedAt: Date | null;
};

export function trustOf(type: string, f: TierFields): Trust {
  if (FIELD_KEYS.some((k) => f[k].status === "MISMATCH")) return "MISMATCH";
  const level = evidenceLevel(f, evidenceKeys(type));
  if (level === "BANK_CONFIRMED") return "CONFIRMED";
  if (level === "SANDBOX_ONLY") return "SANDBOX";
  return FIELD_KEYS.some((k) => f[k].status === "MATCH") ? "EXTRACTED" : "CLAIMED";
}

export function toRow(
  i: {
    id: string;
    code: string;
    type: string;
    status: InstrumentStatus;
    submittedAt: Date | null;
    institutionId: string;
    requiredAmount: { toString(): string };
    institution: { name: string; state: string; regionalOffice: string; riskScore: number };
  },
  f: TierFields,
  openDiscrepancies: number,
  now: Date,
): RegistryRow {
  const maturity = (effectiveValue(f.maturityDate) as string | null) ?? null;
  const lien = effectiveValue(f.lienNoted);
  return {
    id: i.id,
    code: i.code,
    type: i.type,
    status: i.status,
    institutionId: i.institutionId,
    institution: i.institution.name,
    state: i.institution.state,
    regionalOffice: i.institution.regionalOffice,
    risk: i.institution.riskScore,
    requiredPaise: BigInt(i.requiredAmount.toString().split(".")[0] || "0"),
    bank: (effectiveValue(f.bankName) as string | null) ?? null,
    fdrNumber: (effectiveValue(f.fdrNumber) as string | null) ?? null,
    amountPaise: BigInt(String(effectiveValue(f.amount) ?? "0").split(".")[0] || "0"),
    issueDate: (effectiveValue(f.issueDate) as string | null) ?? null,
    maturityDate: maturity,
    daysToMaturity: maturity ? daysBetween(now, maturity) : null,
    trust: trustOf(i.type, f),
    lien: typeof lien === "boolean" ? lien : null,
    lienConfirmed: f.lienNoted.confirmed?.value === true,
    openDiscrepancies,
    submittedAt: i.submittedAt,
  };
}

// ── categories ────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { key: "all", label: "All instruments" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring (≤ 90 days)" },
  { key: "matured", label: "Matured" },
  { key: "renewed", label: "Renewed / replaced" },
  { key: "released", label: "Released" },
  { key: "pending", label: "Pending action" },
  { key: "rejected", label: "Rejected" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

const LIVE: InstrumentStatus[] = ["ACTIVE", "EXPIRING"];

export function inCategory(r: RegistryRow, c: Category): boolean {
  switch (c) {
    case "all":
      return true;
    case "active":
      return LIVE.includes(r.status) && (r.daysToMaturity === null || r.daysToMaturity > 90);
    case "expiring":
      return LIVE.includes(r.status) && r.daysToMaturity !== null && r.daysToMaturity >= 0 && r.daysToMaturity <= 90;
    case "matured":
      return r.status === "MATURED" || (LIVE.includes(r.status) && r.daysToMaturity !== null && r.daysToMaturity < 0);
    case "renewed":
      return r.status === "RENEWED" || r.status === "REPLACED";
    case "released":
      return r.status === "RELEASED" || r.status === "CLOSED";
    case "pending":
      return r.status === "SUBMITTED" || r.status === "UNDER_SCRUTINY" || r.status === "RELEASE_REQUESTED";
    case "rejected":
      return r.status === "REJECTED";
  }
}

export function asCategory(v: string | undefined): Category {
  return (CATEGORIES.find((c) => c.key === v)?.key ?? "all") as Category;
}

// ── plain-words search ────────────────────────────────────────────────────────

export type Query = {
  minPaise?: bigint;
  maxPaise?: bigint;
  withinDays?: number;
  matured?: boolean;
  verified?: boolean;
  flagged?: boolean;
  noLien?: boolean;
  highRisk?: boolean;
  states: string[];
  banks: string[];
  words: string[];
};

export type ParsedQuery = { query: Query; chips: string[] };

const LAKH = 100_000n * 100n;
const CRORE = 100n * LAKH;
const STOP = new Set(["in", "of", "the", "with", "and", "all", "show", "me", "for", "from", "fdr", "fdrs", "deposits", "deposit", "instruments", "that", "are", "is", "which", "at", "a"]);

function money(n: string, unit: string): bigint {
  const v = Number(n);
  const per = /^(cr|crore|crores)$/.test(unit) ? CRORE : LAKH;
  return BigInt(Math.round(v * 100)) * per / 100n;
}

/** Reads a plain-words query into filters. `states` and `banks` are the names known to the registry. */
export function parseQuery(input: string, vocab: { states: string[]; banks: string[] }): ParsedQuery {
  let s = ` ${input.toLowerCase().replace(/[₹,]/g, " ").replace(/\brs\.?/g, " ").replace(/\s+/g, " ")} `;
  const q: Query = { states: [], banks: [], words: [] };
  const chips: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(s);
    if (m) {
      fn(m);
      s = s.replace(m[0], " ");
    }
  };
  const amt = String.raw`(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l|crores?|cr)\b`;
  take(new RegExp(String.raw`\b(?:between|from)\s+${amt}\s+(?:and|to)\s+${amt}`), (m) => {
    q.minPaise = money(m[1], m[2]);
    q.maxPaise = money(m[3], m[4]);
    chips.push(`Amount ${m[1]} ${m[2]} to ${m[3]} ${m[4]}`);
  });
  take(new RegExp(String.raw`\b(?:above|over|more than|greater than|at least|>=?)\s*${amt}`), (m) => {
    q.minPaise = money(m[1], m[2]);
    chips.push(`Amount ≥ ${m[1]} ${m[2]}`);
  });
  take(new RegExp(String.raw`\b(?:below|under|less than|up to|upto|<=?)\s*${amt}`), (m) => {
    q.maxPaise = money(m[1], m[2]);
    chips.push(`Amount ≤ ${m[1]} ${m[2]}`);
  });
  take(/\b(?:expir\w*|matur(?:ing|es)|due)\s+(?:in|within|in the next|next)\s+(\d+)\s*(days?|months?)\b/, (m) => {
    q.withinDays = Number(m[1]) * (m[2].startsWith("month") ? 30 : 1);
    chips.push(`Matures within ${q.withinDays} days`);
  });
  take(/\b(?:not|un|non)[\s-]?(?:bank[\s-])?(?:verified|confirmed)\b|\bunverified\b/, () => {
    q.verified = false;
    chips.push("Not bank-checked");
  });
  take(/\b(?:bank[\s-])?(?:verified|confirmed)\b/, () => {
    q.verified = true;
    chips.push("Bank-checked");
  });
  take(/\b(?:lien not marked|no lien|without lien|lien missing|missing lien|unmarked lien)\b/, () => {
    q.noLien = true;
    chips.push("Lien not marked");
  });
  take(/\b(?:matured|overdue|not renewed|lapsed)\b(?:\s+and\s+not\s+renewed)?/, () => {
    q.matured = true;
    chips.push("Matured");
  });
  take(/\b(?:mismatch\w*|discrepanc\w*|flagged|suspicious)\b/, () => {
    q.flagged = true;
    chips.push("Flagged");
  });
  take(/\bhigh[\s-]risk\b|\brisky\b/, () => {
    q.highRisk = true;
    chips.push("High risk");
  });
  for (const st of [...vocab.states].sort((a, b) => b.length - a.length)) {
    const k = ` ${st.toLowerCase()} `;
    if (s.includes(k)) {
      q.states.push(st);
      chips.push(`State: ${st}`);
      s = s.replace(k, " ");
    }
  }
  for (const b of [...vocab.banks].sort((a, b) => b.length - a.length)) {
    const full = b.toLowerCase();
    const short = full.replace(/\s+bank$/, "");
    for (const k of [` ${full} `, ` ${short} bank `, ` ${short} `]) {
      if (short.length > 3 && s.includes(k)) {
        q.banks.push(b);
        chips.push(`Bank: ${b}`);
        s = s.replace(k, " ");
        break;
      }
    }
  }
  q.words = s.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  for (const w of q.words) chips.push(`“${w}”`);
  return { query: q, chips };
}

export function matches(r: RegistryRow, q: Query): boolean {
  if (q.minPaise !== undefined && r.amountPaise < q.minPaise) return false;
  if (q.maxPaise !== undefined && r.amountPaise > q.maxPaise) return false;
  if (q.withinDays !== undefined && !(LIVE.includes(r.status) && r.daysToMaturity !== null && r.daysToMaturity >= 0 && r.daysToMaturity <= q.withinDays)) return false;
  if (q.matured && !inCategory(r, "matured")) return false;
  const checked = r.trust === "CONFIRMED" || r.trust === "SANDBOX";
  if (q.verified !== undefined && checked !== q.verified) return false;
  if (q.flagged && !(r.trust === "MISMATCH" || r.openDiscrepancies > 0)) return false;
  if (q.noLien && r.lien === true) return false;
  if (q.highRisk && r.risk < 60) return false;
  if (q.states.length && !q.states.includes(r.state)) return false;
  if (q.banks.length && !q.banks.includes(r.bank ?? "")) return false;
  const hay = `${r.code} ${r.institution} ${r.state} ${r.regionalOffice} ${r.bank ?? ""} ${r.fdrNumber ?? ""}`.toLowerCase();
  return q.words.every((w) => hay.includes(w));
}

// ── sorting ───────────────────────────────────────────────────────────────────

export const SORTS = ["submitted", "amount", "maturity", "risk", "institution"] as const;
export type SortKey = (typeof SORTS)[number];

export function sortRows(rows: RegistryRow[], key: SortKey, dir: "asc" | "desc"): RegistryRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: RegistryRow): number | string => {
    switch (key) {
      case "amount":
        return Number(r.amountPaise);
      case "maturity":
        return r.daysToMaturity ?? Number.MAX_SAFE_INTEGER;
      case "risk":
        return r.risk;
      case "institution":
        return r.institution;
      default:
        return r.submittedAt?.getTime() ?? 0;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return (x < y ? -1 : x > y ? 1 : a.code.localeCompare(b.code)) * sign;
  });
}

const CSV_HEAD = ["Reference", "Institution", "State", "Regional office", "Bank", "FDR number", "Amount (Rs)", "Issue date", "Maturity date", "Status", "Trust level", "Lien", "Risk", "Open discrepancies"];

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: RegistryRow[]): string {
  const lines = rows.map((r) =>
    [
      r.code,
      r.institution,
      r.state,
      r.regionalOffice,
      r.bank,
      r.fdrNumber,
      (r.amountPaise / 100n).toString(),
      r.issueDate,
      r.maturityDate,
      r.status,
      r.trust,
      r.lien === null ? "" : r.lien ? "Marked" : "Not marked",
      Math.round(r.risk),
      r.openDiscrepancies,
    ]
      .map(cell)
      .join(","),
  );
  return [CSV_HEAD.join(","), ...lines].join("\r\n") + "\r\n";
}
