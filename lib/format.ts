// Money is paise (integer string / bigint). Dates are UTC; display is IST.

const DAY_MS = 86_400_000;

type MoneyLike = string | number | bigint | { toString(): string } | null | undefined;

export function toBigPaise(v: MoneyLike): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const s = v.toString().trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return BigInt(s.split(".")[0]);
}

/** ₹50,00,000 */
export function formatINR(paise: MoneyLike): string {
  const p = toBigPaise(paise);
  if (p === null) return "—";
  const rupees = Number(p / 100n);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** ₹50 L / ₹1.2 Cr */
export function formatLakh(paise: MoneyLike): string {
  const p = toBigPaise(paise);
  if (p === null) return "—";
  const rupees = Number(p) / 100;
  if (rupees >= 1e7) return `₹${+(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${+(rupees / 1e5).toFixed(2)} L`;
  return formatINR(p);
}

export function rupeesToPaise(rupees: string | number): string {
  const n = typeof rupees === "number" ? rupees : Number(String(rupees).replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid rupee amount: ${rupees}`);
  return String(Math.round(n * 100));
}

export function paiseToRupees(paise: MoneyLike): number | null {
  const p = toBigPaise(paise);
  return p === null ? null : Number(p) / 100;
}

/** "YYYY-MM-DD" → Date at UTC midnight */
export function parseDay(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new Error(`Invalid day: ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole days from a to b (b − a), at day granularity. */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = startOfDayUTC(typeof a === "string" ? parseDay(a) : a);
  const db = startOfDayUTC(typeof b === "string" ? parseDay(b) : b);
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function addYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + n);
  return r;
}

const IST = "Asia/Kolkata";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? (d.length === 10 ? parseDay(d) : new Date(d)) : d;
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date) + " IST"
  );
}

export function shortHash(h: string | null | undefined, n = 10): string {
  return h ? `${h.slice(0, n)}…` : "—";
}

const ACRONYMS: Record<string, string> = { noc: "NOC", ro: "RO", aa: "AA", loa: "LoA", eoa: "EoA", fdr: "FDR", sla: "SLA", ai: "AI", inapp: "in-app" };

export function humanize(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w, i) => ACRONYMS[w] ?? (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
