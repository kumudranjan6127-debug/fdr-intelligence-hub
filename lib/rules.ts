// U5 — APH rules + penalty engine. Rules are versioned JSON (RuleSet table); this file holds the
// evaluation logic, the default rule set used to seed it, and RULE_REGISTER: where each rule comes from.
// Source: AICTE Approval Process Handbook 2024-25 to 2026-27 (printed page numbers), checked on 28 Oct 2026.
import { addDays, daysBetween } from "./format";

export const DISCIPLINES = [
  "ENGINEERING_TECHNOLOGY",
  "PLANNING",
  "APPLIED_ARTS_CRAFTS",
  "DESIGN",
  "HMCT",
  "COMPUTER_APPLICATIONS",
  "MANAGEMENT",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export type Level = "DIPLOMA" | "UG" | "PG";
export type ProgrammeLevel = { discipline: Discipline; level: Level };

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  ENGINEERING_TECHNOLOGY: "Engineering and Technology",
  PLANNING: "Planning",
  APPLIED_ARTS_CRAFTS: "Applied Arts and Crafts",
  DESIGN: "Design",
  HMCT: "Hotel Management and Catering Technology",
  COMPUTER_APPLICATIONS: "Computer Applications",
  MANAGEMENT: "Management",
};

export type Rules = {
  termYears: number;
  affidavitWindowDays: number;
  /** Late-affidavit penalty tiers: submitted on/before the given month-day of the intimation year. */
  lateAffidavitTiers: { untilMonthDay: string; pct: number; ref: string }[];
  /** APH Table 1.4: security deposit in lakh per programme and level (null = level not offered). */
  depositTableLakh: Record<Discipline, Record<Level, number | null>>;
  depositTableRef: string;
  /** Used only when an institution's programmes are not on record. Not an APH figure. */
  fallbackPerProgrammePaise: string;
  leaseMultiplier: number;
  maturityReminderDays: number[];
  expiringWindowDays: number;
  caseSlaDays: number;
  releasePenalties: {
    eoaLapse: { minYears: number; pct: number; ref: string };
    closureDocsLapse: { pct: number; ref: string };
    earlyEncashment: { pct: number; ref: string };
    none: { ref: string };
  };
};

export const DEFAULT_RULES: Rules = {
  termYears: 10,
  affidavitWindowDays: 15,
  lateAffidavitTiers: [
    { untilMonthDay: "05-31", pct: 10, ref: "APH 2024-27 cl. 2.25(f), p. 31: affidavit after 15 days, by 31 May" },
    { untilMonthDay: "07-31", pct: 20, ref: "APH 2024-27 cl. 2.25(f), p. 31: affidavit after 15 days, by 31 July" },
  ],
  depositTableLakh: {
    ENGINEERING_TECHNOLOGY: { DIPLOMA: 15, UG: 35, PG: 15 },
    PLANNING: { DIPLOMA: 15, UG: 15, PG: 15 },
    APPLIED_ARTS_CRAFTS: { DIPLOMA: 15, UG: 15, PG: 15 },
    DESIGN: { DIPLOMA: 15, UG: 15, PG: 15 },
    HMCT: { DIPLOMA: 15, UG: 15, PG: 15 },
    COMPUTER_APPLICATIONS: { DIPLOMA: null, UG: 5, PG: 15 },
    MANAGEMENT: { DIPLOMA: null, UG: 5, PG: 15 },
  },
  depositTableRef: "APH 2024-27 cl. 1.12, Table 1.4, p. 10",
  fallbackPerProgrammePaise: "250000000", // ₹25,00,000, illustrative
  leaseMultiplier: 2,
  maturityReminderDays: [90, 30, 7],
  expiringWindowDays: 90,
  caseSlaDays: 15,
  releasePenalties: {
    eoaLapse: { minYears: 6, pct: 50, ref: "APH 2024-27 cl. 2.21(i), p. 27: no EoA application in the preceding six years" },
    closureDocsLapse: { pct: 10, ref: "APH 2024-27 cl. 2.21(h), p. 27: closure documents not submitted within the programme duration" },
    earlyEncashment: { pct: 10, ref: "APH 2024-27 cl. 7.7, p. 73: FDR encashed before maturity" },
    none: { ref: "APH 2024-27 cl. 6.46, p. 61: release of security deposit; no deduction applicable" },
  },
};

export function parseRules(json: unknown): Rules {
  return { ...DEFAULT_RULES, ...((json ?? {}) as Partial<Rules>) };
}

export type RequiredAmount = { paise: bigint; basis: "EXEMPT" | "TABLE_1_4" | "FALLBACK"; ref: string; lines: { label: string; lakh: number }[] };

/** Sum of Table 1.4 for every programme/level the institution runs, doubled for leased premises. */
export function requiredAmountDetail(
  inst: { programmes: number; isLeased: boolean; isGovernment: boolean; programmeLevels?: unknown },
  rules: Rules = DEFAULT_RULES,
): RequiredAmount {
  if (inst.isGovernment) return { paise: 0n, basis: "EXEMPT", ref: "APH 2024-27 cl. 1.12, p. 10: Government / Government-aided institutions are exempt", lines: [] };
  const mult = inst.isLeased ? BigInt(rules.leaseMultiplier) : 1n;
  const levels = Array.isArray(inst.programmeLevels) ? (inst.programmeLevels as ProgrammeLevel[]) : [];
  const lines = levels.flatMap((p) => {
    const lakh = rules.depositTableLakh[p.discipline]?.[p.level];
    return lakh ? [{ label: `${DISCIPLINE_LABEL[p.discipline]} · ${p.level === "DIPLOMA" ? "Diploma" : p.level}`, lakh }] : [];
  });
  if (lines.length) {
    const paise = BigInt(lines.reduce((s, l) => s + l.lakh, 0)) * 10_000_000n * mult;
    return { paise, basis: "TABLE_1_4", ref: `${rules.depositTableRef}${inst.isLeased ? "; doubled for a private leased building / land" : ""}`, lines };
  }
  const paise = BigInt(rules.fallbackPerProgrammePaise) * BigInt(Math.max(1, inst.programmes)) * mult;
  return { paise, basis: "FALLBACK", ref: "Illustrative: programme mix not on record, so ₹25 L per programme is assumed", lines: [] };
}

export function requiredAmount(inst: { programmes: number; isLeased: boolean; isGovernment: boolean; programmeLevels?: unknown }, rules: Rules = DEFAULT_RULES): bigint {
  return requiredAmountDetail(inst, rules).paise;
}

export function affidavitDeadline(intimationDate: Date, rules: Rules = DEFAULT_RULES): Date {
  return addDays(intimationDate, rules.affidavitWindowDays);
}

export type AffidavitPenalty =
  | { kind: "ON_TIME"; pct: 0; ref: string }
  | { kind: "LATE"; pct: number; ref: string }
  | { kind: "WITHDRAWN"; pct: null; ref: string };

export function affidavitPenalty(intimationDate: Date, submittedAt: Date, rules: Rules = DEFAULT_RULES): AffidavitPenalty {
  if (daysBetween(intimationDate, submittedAt) <= rules.affidavitWindowDays) {
    return { kind: "ON_TIME", pct: 0, ref: "APH 2024-27 cl. 2.25(f), p. 31: within 15 days of intimation" };
  }
  const year = intimationDate.getUTCFullYear();
  for (const t of rules.lateAffidavitTiers) {
    const [m, d] = t.untilMonthDay.split("-").map(Number);
    if (submittedAt.getTime() <= Date.UTC(year, m - 1, d, 23, 59, 59)) return { kind: "LATE", pct: t.pct, ref: t.ref };
  }
  return { kind: "WITHDRAWN", pct: null, ref: "APH 2024-27 cl. 2.25(f), p. 31: not received by 31 July; approval withdrawn" };
}

export type PenaltyContext = {
  lastEoaYear: number | null;
  asOf: Date;
  /** Closure applied for, but the mandatory documents were not submitted within the programme duration. */
  closureDocsLapsed: boolean;
  /** The FDR was encashed before maturity (no data feed until a live bank / AA source exists). */
  encashedBeforeMaturity: boolean;
};

export type PenaltyResult = { pct: number; ruleRef: string; reasons: string[] };

/**
 * Highest single applicable deduction; the APH does not say deductions add up, so they are not combined.
 * A late Affidavit 3 is penalised when the deposit is created (cl. 2.25(f)), not at release, and open
 * discrepancies hold a release rather than reduce it, so neither is a release deduction here.
 */
export function releasePenalty(ctx: PenaltyContext, rules: Rules = DEFAULT_RULES): PenaltyResult {
  const p = rules.releasePenalties;
  if (ctx.lastEoaYear !== null) {
    const gap = ctx.asOf.getUTCFullYear() - ctx.lastEoaYear;
    if (gap >= p.eoaLapse.minYears) {
      return { pct: p.eoaLapse.pct, ruleRef: p.eoaLapse.ref, reasons: [`Last EoA in ${ctx.lastEoaYear}: ${gap} years without applying for Extension of Approval`] };
    }
  }
  if (ctx.closureDocsLapsed) return { pct: p.closureDocsLapse.pct, ruleRef: p.closureDocsLapse.ref, reasons: ["Closure documents were not submitted within the programme duration"] };
  if (ctx.encashedBeforeMaturity) return { pct: p.earlyEncashment.pct, ruleRef: p.earlyEncashment.ref, reasons: ["FDR encashed before maturity"] };
  return { pct: 0, ruleRef: p.none.ref, reasons: ["No deduction condition met"] };
}

export function penaltyAmount(principalPaise: bigint, pct: number): bigint {
  return (principalPaise * BigInt(Math.round(pct * 100))) / 10000n;
}

// ───────────── rule register: where each rule comes from ─────────────

export type RuleStatus = "VERIFIED" | "CONFLICT" | "ILLUSTRATIVE" | "NOT_WIRED";
export type RuleSource = { doc: string; clause: string; page: string; quote: string };
export type RegisterEntry = { id: string; rule: string; engine: string; status: RuleStatus; sources: RuleSource[]; note?: string };

export const POLICY_EFFECTIVE = "Academic years 2024-25 to 2026-27 (APH 2024-27)";
export const POLICY_CHECKED_ON = "2026-10-28";
const APH = "AICTE Approval Process Handbook 2024-25 to 2026-27";
const GUIDELINES = "AICTE (Grant of Approvals for the Technical Institutions) Guidelines, 2024-27";

export const RULE_REGISTER: RegisterEntry[] = [
  {
    id: "term",
    rule: "Deposit term",
    engine: "10 years; principal back to the Trust, interest kept by AICTE",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "1.12(iv)–(v)", page: "10", quote: "The amount deposited by the Institution shall remain with the Council for 10 years." }],
  },
  {
    id: "amount",
    rule: "Deposit amount",
    engine: "Table 1.4 per programme and level (e.g. Engineering UG ₹35 L, Diploma/PG ₹15 L, BBA/BCA ₹5 L)",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "1.12, Table 1.4", page: "10", quote: "Security Deposit (in Lakh) applicable for Institutions under Different Programme(s)" }],
    note: "Institutions whose programme mix is not on record fall back to an illustrative ₹25 L per programme, labelled as such.",
  },
  {
    id: "lease",
    rule: "Leased premises",
    engine: "Deposit doubled",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "Table 1.4, note", page: "10", quote: "The Security Deposit amount shall be DOUBLE in case of private leased building / land." }],
  },
  {
    id: "exempt",
    rule: "Exemptions",
    engine: "Government / Government-aided institutions pay no deposit",
    status: "VERIFIED",
    sources: [
      { doc: APH, clause: "1.12", page: "10", quote: "Applicants for starting new Technical Institutions other than Government/ Government aided Institutions" },
      { doc: APH, clause: "1.12(i)", page: "10", quote: "in existence for more than 5 years with the respective Regulatory Bodies are exempted" },
    ],
    note: "The engine models the Government / Government-aided exemption. The exemption for existing institutions under cl. 1.3.3 (over 5 years) and the university cases in cl. 4.10 are not modelled yet.",
  },
  {
    id: "affidavit-window",
    rule: "Proof of deposit with Affidavit 3",
    engine: "Within 15 days of intimation",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "2.25(f)", page: "31", quote: "submit the payment proof of the Security Deposit along with an Affidavit 3 within 15 days from the date of intimation" }],
  },
  {
    id: "late-affidavit",
    rule: "Late Affidavit 3 penalty",
    engine: "10% by 31 May, 20% by 31 July, then approval withdrawn",
    status: "CONFLICT",
    sources: [
      { doc: APH, clause: "2.25(f)", page: "31", quote: "a penalty of 10% and 20% of the value of the Security Deposit shall be imposed up to 31st May and 31st July" },
      { doc: GUIDELINES, clause: "6.2(f)", page: "—", quote: "a penalty of 10% and 50% of the value of the Security Deposit shall be imposed upto 31st May and 31st July" },
      { doc: GUIDELINES, clause: "6.3(l)", page: "—", quote: "a penalty of 10% and 50% … upto 30th May and 31st July" },
    ],
    note: "The handbook says 20% for the second tier; the guidelines say 50%, and cl. 6.3(l) also says 30 May. The engine follows the handbook until AICTE confirms which applies. The rate lives in the RuleSet JSON, so it can be changed without code.",
  },
  {
    id: "release-eoa",
    rule: "Release deduction: no EoA application for six years",
    engine: "50% of the deposit",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "2.21(i)", page: "27", quote: "Institutions not applied on the portal from past preceding six years for EoA … a penalty of 50%" }],
  },
  {
    id: "release-closure",
    rule: "Release deduction: closure documents not submitted in time",
    engine: "10% of the deposit",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "2.21(h)", page: "27", quote: "a penalty of 10% of the value of the Security Deposit shall be imposed before the release" }],
  },
  {
    id: "early-encashment",
    rule: "FDR encashed before maturity",
    engine: "10% of the FDR",
    status: "NOT_WIRED",
    sources: [{ doc: APH, clause: "7.7", page: "73", quote: "where FDRs are encashed before the date of maturity … a penalty of 10% of the value of the FDR shall be imposed" }],
    note: "Encoded in the engine, but no data source reports early encashment until a live bank / AA feed exists.",
  },
  {
    id: "release-procedure",
    rule: "Release procedure",
    engine: "Application + Affidavit 6 + FDR copy + latest LoA/EoA; cell clearances; NOC by the Approval Bureau",
    status: "VERIFIED",
    sources: [{ doc: APH, clause: "6.46(a)–(c)", page: "61", quote: "Clearance from Public Grievance Redressal Cell (PGRC), Vigilance Cell and Other Cells/Bureaus … are required" }],
    note: "The demo routes clearances to Finance, Legal and Grievance cells; the handbook names PGRC, Vigilance and grant-giving bureaus.",
  },
  {
    id: "sla",
    rule: "Case SLA and reminder schedule",
    engine: "15-day SLA; reminders at 90 / 30 / 7 days",
    status: "ILLUSTRATIVE",
    sources: [],
    note: "Operational settings of this portal, not handbook rules.",
  },
];
