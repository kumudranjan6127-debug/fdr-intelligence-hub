// U5 — APH rules + penalty engine. Rules are versioned JSON (RuleSet table); this file holds the
// evaluation logic and the default rule set used to seed it.
import { addDays, daysBetween } from "./format";

export type Rules = {
  termYears: number;
  affidavitWindowDays: number;
  /** Late-affidavit penalty tiers: submitted on/before the given month-day of the intimation year. */
  lateAffidavitTiers: { untilMonthDay: string; pct: number; ref: string }[];
  perProgrammePaise: string;
  leaseMultiplier: number;
  maturityReminderDays: number[];
  expiringWindowDays: number;
  caseSlaDays: number;
  releasePenalties: {
    eoaLapse: { minYears: number; pct: number; ref: string };
    nonCompliance: { pct: number; ref: string };
    none: { ref: string };
  };
};

export const DEFAULT_RULES: Rules = {
  termYears: 10,
  affidavitWindowDays: 15,
  lateAffidavitTiers: [
    { untilMonthDay: "05-31", pct: 10, ref: "APH 2024-27 §1.12 — affidavit after 15 days, by 31 May" },
    { untilMonthDay: "07-31", pct: 20, ref: "APH 2024-27 §1.12 — affidavit after 15 days, by 31 July" },
  ],
  // Illustrative per-programme amount — configure from the APH 2024-27 fee/deposit appendix.
  perProgrammePaise: "250000000", // ₹25,00,000
  leaseMultiplier: 2,
  maturityReminderDays: [90, 30, 7],
  expiringWindowDays: 90,
  caseSlaDays: 15,
  releasePenalties: {
    eoaLapse: {
      minYears: 3,
      pct: 50,
      ref: "APH 2024-27 §2.16 — institution stopped seeking EoA for ≥3 years before release",
    },
    nonCompliance: {
      pct: 10,
      ref: "APH 2024-27 §1.12 — non-compliance with deposit conditions (late affidavit / unresolved discrepancy)",
    },
    none: { ref: "APH 2024-27 §6.46 — Release of Security Deposit; no deduction applicable" },
  },
};

export function parseRules(json: unknown): Rules {
  return { ...DEFAULT_RULES, ...((json ?? {}) as Partial<Rules>) };
}

export function requiredAmount(
  inst: { programmes: number; isLeased: boolean; isGovernment: boolean },
  rules: Rules = DEFAULT_RULES,
): bigint {
  if (inst.isGovernment) return 0n;
  const base = BigInt(rules.perProgrammePaise) * BigInt(Math.max(1, inst.programmes));
  return inst.isLeased ? base * BigInt(rules.leaseMultiplier) : base;
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
    return { kind: "ON_TIME", pct: 0, ref: "APH 2024-27 §1.12 — within 15 days" };
  }
  const year = intimationDate.getUTCFullYear();
  for (const t of rules.lateAffidavitTiers) {
    const [m, d] = t.untilMonthDay.split("-").map(Number);
    if (submittedAt.getTime() <= Date.UTC(year, m - 1, d, 23, 59, 59)) return { kind: "LATE", pct: t.pct, ref: t.ref };
  }
  return { kind: "WITHDRAWN", pct: null, ref: "APH 2024-27 §1.12 — affidavit not received by 31 July; approval withdrawn" };
}

export type PenaltyContext = {
  lastEoaYear: number | null;
  asOf: Date;
  lateAffidavit: boolean;
  openHighDiscrepancies: number;
};

export type PenaltyResult = { pct: number; ruleRef: string; reasons: string[] };

/** Highest single applicable deduction (deductions are not cumulative). */
export function releasePenalty(ctx: PenaltyContext, rules: Rules = DEFAULT_RULES): PenaltyResult {
  const p = rules.releasePenalties;
  const reasons: string[] = [];
  if (ctx.lastEoaYear !== null) {
    const gap = ctx.asOf.getUTCFullYear() - ctx.lastEoaYear;
    if (gap >= p.eoaLapse.minYears) {
      reasons.push(`Last EoA in ${ctx.lastEoaYear} — ${gap} years without Extension of Approval`);
      return { pct: p.eoaLapse.pct, ruleRef: p.eoaLapse.ref, reasons };
    }
  }
  if (ctx.lateAffidavit) reasons.push("Affidavit submitted after the 15-day window");
  if (ctx.openHighDiscrepancies > 0) reasons.push(`${ctx.openHighDiscrepancies} unresolved high-severity discrepancy(ies)`);
  if (reasons.length) return { pct: p.nonCompliance.pct, ruleRef: p.nonCompliance.ref, reasons };
  return { pct: 0, ruleRef: p.none.ref, reasons: ["No deduction condition met"] };
}

export function penaltyAmount(principalPaise: bigint, pct: number): bigint {
  return (principalPaise * BigInt(Math.round(pct * 100))) / 10000n;
}
