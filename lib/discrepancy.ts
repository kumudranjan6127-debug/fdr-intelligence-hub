// Discrepancy detection — compares the three provenance tiers and runs rule checks on the most
// independent evidence available for each field.
import type { ChainAnalysis } from "./chain";
import { formatINR, fmtDate } from "./format";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  bestEvidence,
  normalize,
  valuesEqual,
  type FieldKey,
  type TierFields,
} from "./provenance";

export type Severity = "LOW" | "MED" | "HIGH";

export type DetectedDiscrepancy = {
  code: string;
  field: string;
  severity: Severity;
  message: string;
  evidence: Record<string, unknown>;
};

export type DiscrepancyInput = {
  instrument: {
    id: string;
    type: "FDR" | "ONLINE_DEPOSIT";
    institutionId: string;
    fields: TierFields;
    requiredAmountPaise: bigint;
    affidavitDueAt: Date | null;
    hasAffidavit: boolean;
  };
  /** Other instruments' identities, for duplicate detection. */
  others: { id: string; code: string; institutionId: string; institutionName: string; bankName: unknown; fdrNumber: unknown }[];
  chain?: ChainAnalysis;
  now: Date;
};

const EXTRACT_SEVERITY: Record<FieldKey, Severity> = {
  amount: "HIGH",
  fdrNumber: "HIGH",
  lienNoted: "HIGH",
  issueDate: "MED",
  maturityDate: "MED",
  bankName: "LOW",
};

function show(key: FieldKey, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (key === "amount") return formatINR(String(v));
  if (key === "issueDate" || key === "maturityDate") return fmtDate(String(v));
  if (key === "lienNoted") return v === true || v === "true" ? "Yes" : "No";
  return String(v);
}

export function detectDiscrepancies(input: DiscrepancyInput): DetectedDiscrepancy[] {
  const { instrument: ins, now } = input;
  const f = ins.fields;
  const out: DetectedDiscrepancy[] = [];

  // 1. Tier comparisons
  for (const key of FIELD_KEYS) {
    const t = f[key];
    if (ins.type === "ONLINE_DEPOSIT" && key === "lienNoted") continue;
    if (t.extracted && t.extracted.value !== null && t.claimed !== null && !valuesEqual(key, t.claimed, t.extracted.value)) {
      out.push({
        code: "CLAIMED_VS_EXTRACTED",
        field: key,
        severity: t.confirmed && valuesEqual(key, t.claimed, t.confirmed.value) ? "LOW" : EXTRACT_SEVERITY[key],
        message: `${FIELD_LABELS[key]}: institution claimed ${show(key, t.claimed)} but the document reads ${show(key, t.extracted.value)}`,
        evidence: { claimed: t.claimed, extracted: t.extracted.value, confidence: t.extracted.confidence, documentId: t.extracted.documentId },
      });
    }
    if (t.confirmed && t.confirmed.value !== null && t.claimed !== null && !valuesEqual(key, t.claimed, t.confirmed.value)) {
      out.push({
        code: "CLAIMED_VS_CONFIRMED",
        field: key,
        severity: "HIGH",
        message: `${FIELD_LABELS[key]}: institution claimed ${show(key, t.claimed)} but the bank confirms ${show(key, t.confirmed.value)}`,
        evidence: { claimed: t.claimed, confirmed: t.confirmed.value, source: t.confirmed.source, ref: t.confirmed.ref },
      });
    }
  }

  // 2. Duplicate FDR number (same bank + number used by another institution)
  if (ins.type === "FDR") {
    const myNo = normalize("fdrNumber", bestEvidence(f.fdrNumber).value);
    const myBank = normalize("bankName", bestEvidence(f.bankName).value);
    if (myNo) {
      const dups = input.others.filter((o) => {
        if (o.id === ins.id || o.institutionId === ins.institutionId) return false;
        const of = o.fdrNumber as { claimed?: unknown; confirmed?: { value?: unknown } | null } | null;
        const ob = o.bankName as { claimed?: unknown; confirmed?: { value?: unknown } | null } | null;
        const oNo = normalize("fdrNumber", (of?.confirmed?.value ?? of?.claimed ?? null) as string | null);
        const oBank = normalize("bankName", (ob?.confirmed?.value ?? ob?.claimed ?? null) as string | null);
        return oNo === myNo && (!myBank || !oBank || oBank === myBank);
      });
      if (dups.length) {
        out.push({
          code: "DUPLICATE_FDR_NUMBER",
          field: "fdrNumber",
          severity: "HIGH",
          message: `FDR number ${String(bestEvidence(f.fdrNumber).value)} is also submitted by ${dups.map((d) => `${d.institutionName} (${d.code})`).join(", ")}`,
          evidence: { duplicates: dups.map((d) => ({ instrumentId: d.id, code: d.code, institution: d.institutionName })) },
        });
      }
    }
  }

  // 3. Amount below required
  const amt = bestEvidence(f.amount);
  const amtNorm = normalize("amount", amt.value);
  if (amtNorm && ins.requiredAmountPaise > 0n && BigInt(amtNorm) < ins.requiredAmountPaise) {
    out.push({
      code: "BELOW_REQUIRED",
      field: "amount",
      severity: "HIGH",
      message: `Principal ${formatINR(amtNorm)} (${amt.tier.toLowerCase()}) is below the required ${formatINR(ins.requiredAmountPaise)}`,
      evidence: { amount: amtNorm, tier: amt.tier, required: ins.requiredAmountPaise.toString() },
    });
  }

  // 4. Maturity before issue
  const iss = normalize("issueDate", bestEvidence(f.issueDate).value);
  const mat = normalize("maturityDate", bestEvidence(f.maturityDate).value);
  if (iss && mat && mat <= iss) {
    out.push({
      code: "MATURITY_BEFORE_ISSUE",
      field: "maturityDate",
      severity: "HIGH",
      message: `Maturity date ${fmtDate(mat)} is on or before issue date ${fmtDate(iss)}`,
      evidence: { issueDate: iss, maturityDate: mat },
    });
  }

  // 5. Lien not noted (FDR only)
  if (ins.type === "FDR") {
    const lien = bestEvidence(f.lienNoted);
    if (lien.value !== null && normalize("lienNoted", lien.value) === "false") {
      out.push({
        code: "LIEN_NOT_NOTED",
        field: "lienNoted",
        severity: "HIGH",
        message: `No lien in favour of Member Secretary, AICTE (${lien.tier.toLowerCase()}) — the deposit can be encashed without AICTE's NOC`,
        evidence: { tier: lien.tier },
      });
    }
  }

  // 6. Missing affidavit after the deadline
  if (!ins.hasAffidavit && ins.affidavitDueAt && ins.affidavitDueAt < now) {
    out.push({
      code: "MISSING_AFFIDAVIT",
      field: "documents",
      severity: "MED",
      message: `Affidavit was due by ${fmtDate(ins.affidavitDueAt)} and has not been uploaded (APH §1.12: 15 days from intimation)`,
      evidence: { dueAt: ins.affidavitDueAt.toISOString() },
    });
  }

  // 7. Chain findings that land on this instrument
  if (input.chain) {
    for (const g of input.chain.gaps.filter((g) => g.toId === ins.id)) {
      out.push({
        code: "COVERAGE_GAP",
        field: "issueDate",
        severity: "HIGH",
        message: `${g.days}-day coverage gap: predecessor matured ${fmtDate(g.from)}, this instrument starts ${fmtDate(g.to)}`,
        evidence: g as unknown as Record<string, unknown>,
      });
    }
    for (const d of input.chain.amountDrops.filter((d) => d.toId === ins.id)) {
      out.push({
        code: "AMOUNT_DROP",
        field: "amount",
        severity: "HIGH",
        message: `Renewed for ${formatINR(d.toPaise)}, down from ${formatINR(d.fromPaise)} on the predecessor`,
        evidence: { fromId: d.fromId, fromPaise: d.fromPaise.toString(), toPaise: d.toPaise.toString() },
      });
    }
  }

  return out;
}
